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
        ttf-freefont \
        poppler-utils \
        imagemagick \
        ghostscript \
        tzdata
RUN cp /usr/share/zoneinfo/Europe/Rome /etc/localtime
RUN echo "Europe/Rome" > /etc/timezone
RUN apk del tzdata

# Copy package.json and lockfile
COPY package.json .
COPY yarn.lock .

# Install dependencies
RUN yarn

# Copy source files
COPY . .
COPY src src/
COPY public public/

# Compile the application into dist/
RUN yarn build

# Launch PM2
EXPOSE 5000
CMD [ "pm2-runtime", "start", "pm2.json" ]
