FROM node:18-alpine AS builder

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

RUN npm run build

FROM nginx:alpine AS runner

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files
COPY --from=builder /omnimap/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]