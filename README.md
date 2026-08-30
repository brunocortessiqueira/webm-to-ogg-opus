# webm-to-ogg-opus

API HTTP em Node.js para conversão de mídia com ffmpeg:

- **Áudio** → **OGG Opus**, recebendo e retornando em base64 via JSON.
- **Vídeo** → **MP4 H.264/AAC** dimensionado para caber num limite de bytes,
  recebendo uma URL e devolvendo o arquivo binário.

O nome do projeto é anterior ao segundo caso.

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
    convertController.js       # Controller do endpoint /convert
    videoConvertController.js  # Controller do endpoint /convert/video
    healthController.js        # Controller do endpoint /health
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
    audioConversionService.js  # Orquestra o fluxo de conversão de áudio
    videoConversionService.js  # Orquestra o fluxo de vídeo
    videoProfile.js            # Decide resolução e bitrate pela duração
  /infra
    ffmpegRunner.js         # Encapsula o spawn do ffmpeg com timeout
    ffprobeRunner.js        # Lê duração e dimensões da mídia
    mediaFetcher.js         # Baixa a origem, com allowlist e limite de bytes
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
  convertVideo.test.js
  videoProfile.test.js
  mediaFetcher.test.js
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
| `FFMPEG_TIMEOUT_MS`      | `30000`    | Timeout do ffmpeg para **áudio**, em milissegundos    |
| `MAX_VIDEO_BYTES`        | `314572800` | Tamanho máximo do vídeo baixado da origem (300 MB)   |
| `FFMPEG_VIDEO_TIMEOUT_MS`| `180000`   | Timeout do ffmpeg para **vídeo** (3 minutos)          |
| `MEDIA_FETCH_TIMEOUT_MS` | `120000`   | Timeout do download da origem                         |
| `MEDIA_TARGET_BYTES`     | `16777216` | Tamanho **alvo** da saída de vídeo (16 MB, o limite do WhatsApp) |
| `MEDIA_ALLOWED_HOSTS`    | vazio      | **Obrigatória para vídeo.** Hosts permitidos em `source_url`, separados por vírgula. Vazio recusa tudo |
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

### POST /convert/video

Recodifica um vídeo para **MP4 H.264/AAC** dimensionado para caber num limite de bytes.

**Requer autenticação.**

#### Por que o contrato é diferente do `/convert`

Não é inconsistência — é a escala do problema. Dois minutos gravados por um celular
(1080p a ~12 Mbps) dão **174 MB**. Se o conteúdo viesse embutido no JSON como no áudio,
seriam ~232 MB de corpo, e a string base64 sozinha ocuparia o dobro disso na memória do
Node antes de virar Buffer. Por isso:

- **entrada por URL**, não por conteúdo — o serviço baixa em streaming direto para o disco;
- **saída binária**, não base64 — economiza 33% de tráfego e uma cópia inteira em memória.

#### Como o bitrate é escolhido

Bitrate fixo não funciona para vídeo longo: medido num vídeo real de 2 minutos, "720p a
2 Mbps" produz 28 MB e continua não cabendo em 16 MB. O alvo sai da **duração**:

```
bitrate_total = (max_bytes × 8 × 0,90) / duração_em_segundos
bitrate_video = bitrate_total − 96 kbps (áudio)
```

E a resolução acompanha o que sobra:

| Bitrate de vídeo disponível | Resolução |
|---|---|
| ≥ 1,4 Mbps | 720p (1280 de largura) |
| ≥ 700 kbps | 480p (854) |
| ≥ 400 kbps | 360p (640) |
| abaixo disso | **recusa** com `422` |

O piso é deliberado: abaixo dele o vídeo fica ilegível, e entregar algo ilegível é pior que
recusar — o operador perde o tempo do envio e o cliente recebe uma mensagem inútil. Com o
alvo de 16 MB, o **teto prático é ~4 minutos**.

#### Requisição

```bash
curl -X POST http://localhost:3000/convert/video   -H "Authorization: Bearer SUA_API_KEY"   -H "Content-Type: application/json"   -d '{"source_url":"https://storage.exemplo.com/midia/video.mp4"}'   -o convertido.mp4
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `source_url` | sim | URL do vídeo. O host precisa estar em `MEDIA_ALLOWED_HOSTS` |
| `max_bytes` | não | Alvo da saída. Aceita valor **menor** que `MEDIA_TARGET_BYTES`; maior é ignorado |

#### Resposta 200

O corpo é o **MP4 binário**. Os dados da conversão vão em headers:

```
Content-Type: video/mp4
X-Convert-Perfil: 480p
X-Convert-Video-Bps: 910632
X-Convert-Duracao-Segundos: 120
X-Convert-Bytes-Entrada: 182250460
X-Convert-Bytes-Saida: 14519897
X-Convert-Duracao-Ms: 8354
```

#### Respostas de erro

| Status | `code` | Quando |
|---|---|---|
| `400` | `SOURCE_URL_MISSING` | `source_url` ausente ou vazia |
| `400` | `MAX_BYTES_INVALID` | `max_bytes` não é um número positivo |
| `403` | `ALLOWLIST_VAZIA` | `MEDIA_ALLOWED_HOSTS` não foi configurada |
| `403` | `HOST_NAO_AUTORIZADO` | host de `source_url` fora da allowlist |
| `413` | `FETCH_TOO_LARGE` | origem acima de `MAX_VIDEO_BYTES` |
| `422` | `VIDEO_MUITO_LONGO` | não cabe nem no pior perfil — ver `detalhes` |
| `422` | `SEM_TRILHA_VIDEO` | o arquivo não tem vídeo |
| `422` | `SAIDA_ACIMA_DO_ALVO` | o encoder estourou o alvo mesmo com o bitrate calculado |
| `502` | `FETCH_REDIRECT` | a origem respondeu com redirect (não é seguido) |
| `504` | `FFMPEG_TIMEOUT` | recodificação passou de `FFMPEG_VIDEO_TIMEOUT_MS` |

O `VIDEO_MUITO_LONGO` traz o número que o cliente precisa para orientar o usuário:

```json
{
  "status": false,
  "erro": "Vídeo de 400s é longo demais para caber no limite. O máximo é cerca de 243s.",
  "code": "VIDEO_MUITO_LONGO",
  "detalhes": {
    "duracao_segundos": 400,
    "duracao_maxima_segundos": 243,
    "max_bytes": 16777216
  }
}
```

#### Segurança: por que a allowlist não é opcional

Buscar uma URL escolhida por quem chama é uma porta de SSRF — bastaria apontar para
`169.254.169.254` ou para um serviço interno da máquina. Três guardas fecham isso:

1. **allowlist de hosts** (`MEDIA_ALLOWED_HOSTS`); vazia recusa tudo, falha fechada;
2. **redirect não é seguido** — um `302` para host de fora burlaria a allowlist;
3. **corte por bytes durante o download** — `content-length` é informado pela origem e pode
   mentir, então o limite vale sobre o que realmente chega.

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
