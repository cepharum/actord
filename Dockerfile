FROM node:8-alpine

RUN mkdir /app
COPY api config registry package.json package-lock.json /app/
RUN cd /app && npm i

EXPOSE 3000
VOLUME /app/registry

WORKDIR /app

ENV IP=0.0.0.0

CMD ["npm", "start"]
