FROM node:20-alpine AS client-build

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --workspace client --include-workspace-root

COPY client ./client
RUN npm run build

FROM node:20-alpine AS server-deps

WORKDIR /app

RUN apk add --no-cache g++ make python3

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --omit=dev \
    && npm cache clean --force

FROM node:20-alpine AS workflow-tools

RUN apk add --no-cache ca-certificates git go

ENV CGO_ENABLED=0
ENV GOBIN=/out

RUN mkdir -p /out \
    && go install github.com/projectdiscovery/httpx/cmd/httpx@v1.9.0 \
    && go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@v2.14.0 \
    && go install github.com/OJ/gobuster/v3@v3.8.2

FROM node:20-alpine AS runtime

ENV NODE_ENV=production
ENV SECLISTS=/opt/seclists
WORKDIR /app

RUN apk add --no-cache curl openssh-client

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY --from=server-deps /app/node_modules ./node_modules
COPY --from=workflow-tools /out/httpx /out/subfinder /out/gobuster /usr/local/bin/
COPY --chown=node:node vendor/seclists /opt/seclists

COPY --chown=node:node server ./server
COPY --from=client-build --chown=node:node /app/client/dist ./client/dist

USER node
EXPOSE 4000

CMD ["npm", "start"]
