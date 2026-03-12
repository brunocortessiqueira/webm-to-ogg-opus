# webm-to-ogg-opus

API HTTP em Node.js para conversão de áudio em qualquer formato suportado pelo ffmpeg para **OGG Opus**, recebendo e retornando o áudio em base64 via JSON.

---

## Tecnologias

- **Node.js 20** + **Express**
- **ffmpeg** (libopus)
- **helmet** — headers de segurança HTTP
- **express-rate-limit** — limitação de requisições por IP
- **uuid** — nomes únicos para arquivos temporários
- **mime-types** — resolução de extensão a partir do mimetype
- **dotenv** — variáveis de ambiente
- **Jest** + **Supertest** — testes automatizados

---

## Estrutura do Projeto

```
/src
  /config
    env.js                  # Leitura e validação de variáveis de ambiente
  /controllers
    convertController.js    # Controller do endpoint /convert
    healthController.js     # Controller do endpoint /health
  /middlewares
    authMiddleware.js       # Validação do Bearer token
    errorHandler.js         # Handler central de erros
    notFoundHandler.js      # Handler 404
    rateLimitMiddleware.js  # Rate limiting por IP
  /routes
    convertRoutes.js
    healthRoutes.js
    index.js
  /services
    audioConversionService.js  # Orquestra o fluxo de conversão
  /infra
    ffmpegRunner.js         # Encapsula o spawn do ffmpeg com timeout
    tempFileManager.js      # Criação, leitura e limpeza de temporários
  /utils
    apiResponse.js          # Respostas JSON padronizadas
    appError.js             # Classe de erro com código HTTP
    base64.js               # Normalização e validação de base64
    logger.js               # Logger estruturado em JSON
    mime.js                 # Resolução de extensão por mimetype
  app.js                    # Configuração do Express
  server.js                 # Inicialização do servidor

/tests
  health.test.js
  auth.test.js
  convert.test.js
```

---

## Pré-requisitos

### Execução local

- Node.js 20+
- npm 10+
- **ffmpeg** instalado e disponível no PATH

```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg

# Verificar instalação
ffmpeg -version
```

### Execução com Docker

- Docker 24+
- Docker Compose v2+

O ffmpeg é instalado automaticamente dentro da imagem.

---

## Instalação

```bash
git clone <url-do-repositorio>
cd webm-to-ogg-opus
npm install
```

---

## Configuração do .env

Copie o arquivo de exemplo e preencha os valores:

```bash
cp .env.example .env
```

Edite o `.env`:

```env
PORT=3000
NODE_ENV=development
API_KEY=sua-chave-secreta-forte-aqui
MAX_AUDIO_BYTES=26214400
JSON_BODY_LIMIT=35mb
FFMPEG_TIMEOUT_MS=30000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=60
LOG_LEVEL=info
```

> **Importante:** `API_KEY` é obrigatória. A aplicação não sobe sem ela.
> Gere uma chave segura: `openssl rand -hex 32`

---

## Variáveis de Ambiente

| Variável                 | Padrão     | Descrição                                             |
|--------------------------|------------|-------------------------------------------------------|
| `PORT`                   | `3000`     | Porta do servidor HTTP                                |
| `NODE_ENV`               | `development` | Ambiente (`development`, `production`, `test`)     |
| `API_KEY`                | —          | **Obrigatória.** Token Bearer para autenticação       |
| `MAX_AUDIO_BYTES`        | `26214400` | Tamanho máximo do buffer de áudio em bytes (25 MB)   |
| `JSON_BODY_LIMIT`        | `35mb`     | Limite do corpo JSON aceito pelo Express              |
| `FFMPEG_TIMEOUT_MS`      | `30000`    | Timeout do processo ffmpeg em milissegundos           |
| `RATE_LIMIT_WINDOW_MS`   | `60000`    | Janela do rate limit em milissegundos (1 minuto)      |
| `RATE_LIMIT_MAX_REQUESTS`| `60`       | Máximo de requisições por IP por janela               |
| `LOG_LEVEL`              | `info`     | Nível de log: `error`, `warn`, `info`, `debug`        |

---

## Execução Local

```bash
# Modo desenvolvimento (com hot reload via --watch do Node 20)
npm run dev

# Modo produção
npm start
```

A API estará disponível em `http://localhost:3000`.

---

## Execução com Docker

### Build e inicialização

```bash
# Certifique-se de que o .env está configurado com API_KEY
docker compose up --build
```

### Em background

```bash
docker compose up -d --build
```

### Parar

```bash
docker compose down
```

### Logs

```bash
docker compose logs -f api
```

---

## Endpoints

### GET /health

Verifica se a API está online.

**Não requer autenticação.**

```bash
curl http://localhost:3000/health
```

**Resposta 200:**
```json
{
  "status": true,
  "erro": "",
  "audio": "",
  "mimetype": "",
  "service": "up"
}
```

---

### POST /convert

Converte um áudio em base64 para **OGG Opus**.

**Headers obrigatórios:**
```
Content-Type: application/json
Authorization: Bearer <API_KEY>
```

**Body:**
```json
{
  "audio": "BASE64_DO_ARQUIVO_DE_AUDIO",
  "mimetype": "audio/webm"
}
```

**Campos:**

| Campo      | Tipo   | Obrigatório | Descrição                                              |
|------------|--------|-------------|--------------------------------------------------------|
| `audio`    | string | Sim         | Áudio em base64 puro ou data URI (`data:...;base64,`) |
| `mimetype` | string | Sim         | MIME type do arquivo de entrada (ex: `audio/webm`)    |

**Formatos de entrada suportados** (qualquer formato que o ffmpeg suporte):
`audio/webm`, `audio/mpeg` (mp3), `audio/mp4`, `audio/wav`, `audio/ogg`, `audio/aac`, `audio/flac`, `audio/opus`, `video/webm`, entre outros.

---

## Exemplos cURL

### Convertendo um arquivo WebM

```bash
# Converter arquivo para base64
AUDIO_B64=$(base64 -w 0 audio.webm)

# Enviar para API
curl -s -X POST http://localhost:3000/convert \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sua-api-key" \
  -d "{\"audio\": \"$AUDIO_B64\", \"mimetype\": \"audio/webm\"}" \
  | jq .
```

### Salvando o áudio convertido

```bash
AUDIO_B64=$(base64 -w 0 audio.webm)

curl -s -X POST http://localhost:3000/convert \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sua-api-key" \
  -d "{\"audio\": \"$AUDIO_B64\", \"mimetype\": \"audio/webm\"}" \
  | jq -r '.audio' | base64 -d > audio_convertido.ogg
```

---

## Formato de Response

### Sucesso (200)

```json
{
  "status": true,
  "erro": "",
  "audio": "<base64 do OGG Opus>",
  "mimetype": "audio/ogg"
}
```

### Erro

```json
{
  "status": false,
  "erro": "Mensagem de erro",
  "audio": "",
  "mimetype": ""
}
```

---

## Códigos de Status HTTP

| Código | Situação                                          |
|--------|---------------------------------------------------|
| `200`  | Conversão realizada com sucesso                   |
| `400`  | JSON inválido, campos ausentes ou base64 inválido |
| `401`  | Bearer token ausente ou inválido                  |
| `404`  | Rota não encontrada                               |
| `413`  | Áudio excede o tamanho máximo permitido           |
| `422`  | Falha na conversão (formato não suportado, etc.)  |
| `429`  | Rate limit excedido                               |
| `500`  | Erro interno inesperado (ffmpeg não encontrado)   |
| `504`  | Timeout na conversão do áudio                     |

---

## Erros Comuns

| Mensagem                          | Causa                                            |
|-----------------------------------|--------------------------------------------------|
| `Bearer token ausente`            | Header Authorization não enviado ou mal formado |
| `Token inválido`                  | API_KEY incorreta                               |
| `JSON inválido`                   | Body não é JSON válido                          |
| `Campo audio inválido`            | Campo `audio` ausente ou não é string           |
| `Base64 inválido`                 | String base64 corrompida ou vazia               |
| `Campo mimetype é obrigatório`    | Campo `mimetype` ausente ou vazio               |
| `Arquivo excede o limite permitido` | Buffer do áudio maior que `MAX_AUDIO_BYTES`   |
| `ffmpeg não encontrado no sistema`| ffmpeg não instalado ou não está no PATH        |
| `Timeout na conversão do áudio`   | Processo ffmpeg ultrapassou `FFMPEG_TIMEOUT_MS` |
| `Falha ao converter áudio`        | Formato não suportado ou arquivo corrompido     |

---

## Testes

```bash
# Executar todos os testes
npm test

# Com cobertura de código
npm run test:coverage
```

Os testes usam **mocks** para o ffmpeg e para os arquivos temporários, portanto **não dependem do ffmpeg instalado** para rodar.

---

## Segurança

- Autenticação obrigatória via Bearer token em todas as rotas de conversão
- Headers HTTP protegidos com `helmet`
- Rate limiting por IP via `express-rate-limit`
- Sem interpolação de shell — ffmpeg executado com `spawn` e array de argumentos
- Stack traces nunca expostos nas respostas ao cliente
- API_KEY lida apenas por variável de ambiente, nunca hardcoded

---

## Observações sobre ffmpeg

- O ffmpeg deve estar instalado e disponível no PATH do sistema
- A saída é sempre **OGG com codec libopus** e bitrate de **64k**
- O timeout do processo é configurável via `FFMPEG_TIMEOUT_MS`
- Arquivos temporários são sempre removidos (sucesso ou erro) via `finally`
- Nomes dos temporários são únicos por requisição usando UUID

---

## Decisões de Design

- **CommonJS**: mantém consistência com o ecossistema Node.js legado e simplifica a configuração
- **Sem banco de dados**: a API é stateless por design
- **Buffer máximo de 25 MB**: limite razoável para áudios; ajuste via `MAX_AUDIO_BYTES`
- **Logs em JSON**: facilita ingestão por ferramentas de observabilidade (Datadog, Loki, etc.)
- **Usuário não-root no Docker**: boa prática de segurança de contêiner
