# Secure QR Auth v3

Статический HTML/CSS/JS-фронтенд + Cloudflare Pages Functions + D1. Репозиторий можно держать на GitHub. Отдельный VPS не нужен.

## Логика

- Гость сразу видит кнопку регистрации и одноразовый QR.
- QR живёт 120 секунд и автоматически заменяется новым.
- Регистрация: ник + пароль. Пароль не отправляется в API. Браузер создаёт ECDSA P-256 ключ; приватный ключ локально шифруется AES-GCM ключом, производным от пароля через PBKDF2-SHA-256 (600000 итераций).
- После регистрации устройство становится доверенным и получает обычную HttpOnly-сессию.
- На странице аккаунта есть кнопка камеры и выход.
- Доверенное устройство сканирует QR другого устройства. После сканирования вводится пароль на доверенном устройстве. Если локальная AES-GCM расшифровка успешна, устройство подписывает одноразовый challenge.
- Cloudflare получает только подпись и проверяет её публичным ключом. Пароль/хеш пароля сервер не получает и не хранит.
- Устройство с QR автоматически получает HttpOnly-сессию после одобрения. Аккаунт на сканирующем устройстве не меняется.

## Что загружать в GitHub

Загружайте:

- `index.html`
- `src/`
- `public/`
- `functions/`
- `schema.sql`
- `package.json`
- `.gitignore`
- `.dev.vars.example`
- `.node-version`
- `README.md`

После `npm install` также обязательно закоммитьте созданный `package-lock.json`.

НЕ загружайте:

- `.dev.vars`
- `.env` / `.env.*`
- `node_modules/`
- `dist/`
- `.wrangler/`
- любые Cloudflare API tokens / секреты

`.gitignore` уже блокирует это.

## Cloudflare Pages из GitHub

1. Создайте GitHub repository и положите файлы из списка выше в корень.
2. Cloudflare -> Workers & Pages -> Create -> Pages -> Connect to Git.
3. Выберите репозиторий.
4. Build command: `npm run build`
5. Build output directory: `dist`
6. Root directory: `/` (корень репозитория).
7. Создайте D1 database, например `secure-auth-db`.
8. В Pages project -> Settings -> Bindings добавьте D1 binding:
   - Variable name: `DB`
   - Database: `secure-auth-db`
9. В Pages project -> Settings -> Variables and Secrets -> Add создайте `LOGIN_HMAC_KEY` длиной минимум 32 случайных символа и обязательно выберите **Encrypt**. Не помещайте значение в GitHub.
10. Выполните `schema.sql` в D1 Console либо через Wrangler.
11. Redeploy Pages project после добавления binding/secret.

## Создание схемы через Wrangler

```bash
npm install
npx wrangler login
npx wrangler d1 create secure-auth-db
npx wrangler d1 execute secure-auth-db --remote --file=./schema.sql
```

Сгенерировать секрет локально можно так:

```bash
openssl rand -hex 32
```

Значение сохранить в Cloudflare как `LOGIN_HMAC_KEY`.

## Локальный тест

Сначала соберите фронтенд:

```bash
npm install
npm run build
```

Создайте `.dev.vars` из `.dev.vars.example` и впишите секрет. Примените `schema.sql` к локальной D1, затем запускайте Pages Dev с binding, например:

```bash
npx wrangler pages dev dist --d1 DB=YOUR_D1_DATABASE_ID
```

## Важное ограничение этой версии

Устройство, которое вошло по QR, получает сессию, но не получает приватный ключ исходного доверенного устройства. Поэтому оно не может подтверждать следующие QR-входы. Это намеренно: мы не копируем private key между устройствами. Следующим этапом можно добавить безопасное добавление нового доверенного устройства через WebAuthn/Passkey.
