FROM keymetrics/pm2:latest-alpine

# Copy package.json
COPY package.json .

# Install dependencies through NPM
RUN npm install

# Copy source files
COPY . .
COPY src src/
COPY public public/

# Compile the application into dist/
RUN npm run build

# Launch PM2
EXPOSE 5000
CMD [ "pm2-runtime", "start", "pm2.json" ]
