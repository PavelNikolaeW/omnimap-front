FROM node:18-alpine AS builder

# Install git for submodule
RUN apk add --no-cache git

WORKDIR /omnimap

# Build arguments for environment URLs
ARG APP_BACKEND_URL=https://omnimap.ru
ARG LLM_GATEWAY_URL=http://0.0.0.0:7998
ARG SINC_SERVICE_URL=wss://omnimap.ru/ws

# Set as environment variables for webpack build
ENV APP_BACKEND_URL=$APP_BACKEND_URL
ENV LLM_GATEWAY_URL=$LLM_GATEWAY_URL
ENV SINC_SERVICE_URL=$SINC_SERVICE_URL

COPY package.json package-lock.json* ./

RUN npm install

# Copy source
COPY . ./

# Initialize submodule (clone if empty)
RUN if [ ! -f "src/llm_chat/package.json" ]; then \
      rm -rf src/llm_chat && \
      git clone --depth 1 https://github.com/PavelNikolaeW/llm_chat.git src/llm_chat; \
    fi

RUN npm run build

FROM node:18-alpine AS runner

WORKDIR /omnimap

RUN npm install -g serve

COPY --from=builder /omnimap/dist ./dist

ENTRYPOINT ["serve", "-s", "dist"]


#docker buildx build --platform linux/amd64 \
#   -t omnimap.cr.cloud.ru/omnimap-frontend:latest \
#   . --push