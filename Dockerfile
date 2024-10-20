FROM node:18-alpine

WORKDIR /omnimap

COPY package.json package-lock.json* ./

RUN npm install

COPY . ./

RUN npm run build

ENTRYPOINT ["npx", "serve", "-s", "dist"]
