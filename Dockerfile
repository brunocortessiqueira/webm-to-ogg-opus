# =============================================================================
# Imagem de produção para a API de conversão de áudio
# =============================================================================

FROM node:20-alpine AS base

# Instala ffmpeg e suas dependências no Alpine
RUN apk add --no-cache ffmpeg

# Cria diretório da aplicação com usuário não-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app

# Copia apenas os arquivos de dependências primeiro (melhor uso do cache)
COPY package*.json ./

# Instala dependências de produção
RUN npm ci --omit=dev

# Copia o código-fonte
COPY src/ ./src/

# Define o usuário não-root
USER appuser

# Porta da aplicação
EXPOSE 3000

# Healthcheck nativo do Docker
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Inicia a aplicação
CMD ["node", "src/server.js"]
