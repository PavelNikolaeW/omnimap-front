FROM node:18-alpine AS builder

WORKDIR /omnimap

COPY package.json package-lock.json* ./

RUN npm install

COPY . ./

RUN npm run build

FROM node:18-alpine AS runner

WORKDIR /omnimap

RUN npm install -g serve

COPY --from=builder /omnimap/dist ./dist

ENTRYPOINT ["serve", "-s", "dist"]


#docker buildx build --platform linux/amd64 \
#   -t omnimap.cr.cloud.ru/omnimap-frontend:latest \
#   . --push