deploy v7
# Secure QR Auth Worker v7 — JEND + Bot Protection

Cloudflare Worker + Static Assets + D1. Версия v7 сохраняет рабочую логику v6 и добавляет защиту от автоматизации.

## Что добавлено

1. **Cloudflare Turnstile** перед регистрацией и созданием QR.
2. **JEND v1** — бинарный `application/jend` контейнер поверх чувствительных POST API.
3. **ECDH P-256 + HKDF-SHA-256 + AES-256-GCM** для JEND.
4. **Replay protection** — одноразовые `request_id` для изменяющих состояние запросов.
5. **Rate limiting** в D1; IP в открытом виде не хранится, используется keyed-HMAC bucket.
6. Старое внутреннее AES-GCM шифрование QR-пароля остаётся. Поэтому пароль сначала зашифрован каналом ПК↔телефон, а уже этот ciphertext едет внутри JEND.
7. Существующие `users`, `devices`, `sessions` и аккаунты удалять не нужно.

Подробный бинарный формат: `JEND_SPEC.md`.

## Что остаётся неизменным

- Открытые юзернеймы не хранятся: только HMAC `login_id`.
- Пароли не хранятся на сервере.
- QR-пароль расшифровывает доверенное устройство.
- При верном пароле телефон подписывает challenge ECDSA P-256 ключом.
- `LOGIN_HMAC_KEY` менять нельзя, иначе изменятся идентификаторы существующих юзернеймов.

# 1. GitHub

Загрузить весь проект v7 поверх текущего репозитория:

```text
worker/
src/
public/
scripts/
index.html
package.json
schema.sql
wrangler.jsonc
JEND_SPEC.md
README.md
.gitignore
.node-version
.dev.vars.example
```

Не загружать:

```text
.dev.vars
.env*
node_modules/
dist/
.wrangler/
```

# 2. Сгенерировать JEND private key

На своём компьютере, в папке проекта:

```bash
npm run jend:keys
```

Команда использует встроенный WebCrypto Node.js и выведет в терминал `JEND_PRIVATE_JWK`.

**Не отправлять этот JWK в GitHub.**

Cloudflare Worker → Settings → Variables and Secrets:

```text
JEND_PRIVATE_JWK = полный JSON из терминала
Type: Secret / Encrypt
```

Публичная часть автоматически извлекается Worker из private JWK и отдаётся браузеру через `/api/security/config`.

# 3. Создать Turnstile

Cloudflare Dashboard → Turnstile → Add widget.

Рекомендуемый режим: **Managed**.

Добавить production hostname, например:

```text
newtestorig.cloudtoptop256.workers.dev
```

После создания получите `site key` и `secret key`.

В Worker → Settings → Variables and Secrets добавить:

```text
TURNSTILE_SITE_KEY
```

как обычную Variable, потому что site key публичный.

И:

```text
TURNSTILE_SECRET_KEY
```

как Secret / Encrypt.

Существующий секрет:

```text
LOGIN_HMAC_KEY
```

оставить без изменений.

# 4. D1

Существующую D1 базу и binding `DB` не удалять.

`worker/schema.js` автоматически создаст две новые служебные таблицы:

```text
jend_replay
rate_limits
```

Они не содержат паролей, юзернеймов или открытых IP.

# 5. Cloudflare Build

Оставить текущие команды:

```text
Build command:  npm run build
Deploy command: npx wrangler deploy
```

`wrangler.jsonc` по-прежнему использует Worker `newtestorig` и D1 binding `DB`.

# JEND поток

Пример чувствительного запроса:

```text
JSON payload
   ↓
если это QR-пароль: уже AES-GCM ciphertext для телефона
   ↓
JEND v1
   ↓
ECDH P-256
   ↓
HKDF-SHA-256
   ↓
AES-256-GCM
   ↓
application/jend binary packet
   ↓
Cloudflare Worker
```

Worker снимает внешний JEND-слой. В случае QR-пароля внутри всё равно остаётся ciphertext, который может открыть только телефон с секретом из QR.

Ответ API также возвращается в `application/jend` и расшифровывается браузером ключом конкретного запроса.

# Rate limits v7

Текущие ограничения в коде:

```text
register:     5 / 15 минут
qr-create:   30 / 10 минут
qr-pair:     40 / 5 минут
qr-password: 20 / 2 минуты
qr-result:   20 / 2 минуты
logout:      30 / минуту
```

И отдельно остаётся максимум 5 неправильных паролей на один QR.

# Turnstile

Turnstile token проверяется Worker через Siteverify. Токен никогда не считается валидным только потому, что браузер показал успешный widget.

После использования widget сбрасывается и получает новый token для следующего QR/регистрации.
