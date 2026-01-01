FROM node:18-alpine AS builder

# Install git for submodule
RUN apk add --no-cache git

WORKDIR /omnimap

# Build arguments for environment URLs
ARG APP_BACKEND_URL=https://omnimap.ru
ARG LLM_GATEWAY_URL=http://0.0.0.0:7998
ARG SINC_SERVICE_URL=wss://omnimap.ru/ws
ARG APP_VERSION=dev

# Set as environment variables for webpack build
ENV APP_BACKEND_URL=$APP_BACKEND_URL
ENV LLM_GATEWAY_URL=$LLM_GATEWAY_URL
ENV SINC_SERVICE_URL=$SINC_SERVICE_URL
ENV APP_VERSION=$APP_VERSION

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

FROM nginx:alpine AS runner

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files
COPY --from=builder /omnimap/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]