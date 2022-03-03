FROM node:lts-alpine AS dev-dependencies
RUN npm install -g typescript
USER node
WORKDIR /usr/src/app
COPY --chown=node:node package*.json /usr/src/app
RUN npm install

FROM node:lts-alpine AS production-dependencies
USER node
WORKDIR /usr/src/app
COPY --chown=node:node package*.json /usr/src/app
RUN npm ci --only=production

FROM dev-dependencies AS compile
USER node
WORKDIR /usr/src/app
COPY --chown=node:node . /usr/src/app
RUN tsc -b /usr/src/app

FROM node:lts-alpine AS final
RUN apk add dumb-init
ENV NODE_ENV production
USER node
WORKDIR /usr/src/app
COPY --chown=node:node --from=production-dependencies /usr/src/app/node_modules /usr/src/app/node_modules
COPY --chown=node:node --from=compile /usr/src/app/dist /usr/src/app/dist
COPY --chown=node:node --from=compile /usr/src/app/static /usr/src/app/static
COPY --chown=node:node --from=compile /usr/src/app/views /usr/src/app/views
EXPOSE 8080
CMD ["dumb-init", "node", "dist/server.js"]
