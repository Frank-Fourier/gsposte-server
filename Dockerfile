FROM keymetrics/pm2:latest-alpine

WORKDIR /usr/src/app

RUN echo "@edge http://nl.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories
RUN apk update
RUN apk add --no-cache \
        build-base \
        libtool \
        autoconf \
        automake \
        jq \
        openssh \
        python \
        libexecinfo-dev@edge \
        chromium \
        nss \
        freetype \
        freetype-dev \
        harfbuzz \
        ca-certificates \
        ttf-freefont

# Copy package.json
COPY package.json .

# Install dependencies through NPM
RUN npm install

# Copy source files
COPY . .
COPY src src/
COPY public public/

# Create upload directories
RUN mkdir public/attachments
RUN mkdir public/invoices
RUN mkdir public/pdf
RUN mkdir public/xlsx

# Compile the application into dist/
RUN npm run build

# Launch PM2
EXPOSE 5000
CMD [ "pm2-runtime", "start", "pm2.json" ]
