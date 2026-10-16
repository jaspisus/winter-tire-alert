FROM node:24-slim

ENV NODE_ENV=production \
    STATE_FILE=/data/state.json

WORKDIR /app
COPY package.json ./
COPY src ./src

# A new named volume copies this directory's ownership, so the non-root user can write state.
RUN mkdir -p /data && chown node:node /data

USER node
CMD ["node", "src/main.ts"]
