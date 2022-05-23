FROM node:16-alpine

WORKDIR /tally-ho

COPY . .

RUN mv .env.prod .env
RUN apk add --no-cache python3 py3-pip git make bash && ln -sf python3 /usr/bin/python
# remotedev-server is using sqlite3 which fails to install/compile at the moment
# I have a hunch that because it fails the postinstall is not run and the patches are not applied
# As a short term workaround we just remove this dependency here, because we don't need it to build 
# It's used only for server
RUN sed -i '/remotedev-server/d' ./background/package.json
RUN yarn install --frozen-lockfile 
RUN yarn build --config-name firefox