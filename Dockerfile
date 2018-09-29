FROM node:8-alpine

RUN mkdir /app
COPY actors api config package.json package-lock.json /app/
RUN cd /app && npm i

EXPOSE 3000
VOLUME /app/actors

WORKDIR /app

ENV IP=0.0.0.0

CMD ["npm", "start"]
