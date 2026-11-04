# Vision backend — builds and runs the TypeScript API/brain server.
# Build context is ./server (see docker-compose.yml: `build: ./server`).
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build:sim && npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/simulation ./simulation
EXPOSE 4000
CMD ["node", "dist/index.js"]
