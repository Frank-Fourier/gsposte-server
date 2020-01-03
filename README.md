# GSPoste Server

GSPoste project backend REST API

### Documentation

#### With Swagger
On startup, the server will automatically generate the Swagger API spec and setup a Swagger UI endpoint all on its own!
So just access it at ```{host}:{port}/api-docs``` while the server is running.

### Develop

Before all, install the dependencies needed to run this project:
```shell
$ yarn install
OR
$ npm install
```

Then, execute the 'dev' command to start the server in development mode!
Live-reload is included.
```shell
$ yarn dev
OR
$ npm run dev
```

### Test

Testing the whole application with Mocha is trivial, just run:
```shell
$ yarn test
OR
$ npm run test
```
To write tests on your own, follow the format of the tests that I already wrote. I want you to follow it strictly!

### Build

Running:
```shell
$ yarn build
OR
$ npm run build
```
Will compile the whole application with tsc in production mode.

You can find the Javascript compiled files in the dist/ directory!

### Deploy with Docker

You should use the orchestrator to deploy this thing. Clone it from gsposte-orch, clone this inside it and run
```shell
docker-compose up -d --build server
```
