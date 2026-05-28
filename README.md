# GSPoste Server

GSPoste project backend REST API

### Project structure

This project is written **entirely** in [TypeScript](https://www.typescriptlang.org). It's built on top of Node.js,
using [Express](https://expressjs.com) as the base framework, but it follows a very different code and file structure.
The database used is MongoDB, using Mongoose to define additional schemas to facilitate ORM. 

The project file structure is as follows:

```
project
├── public
│   ├── logs
│   │   ├── errors.log # All errors logged in production
│   │   └── GSK6RNCXHW.log # Logs about a campaign upload process
│   ├── invoices
│   │   └── 5c991af86327ba47393f2fb3.pdf # PDF invoice for 1 or more letters
│   ├── pdf
│   │   └── GSK6RNCXHW # PDF documents about this campaign
│   │       ├── original.pdf # The original uploaded document
│   │       ├── postel.pdf # The original, formatted with Postel margins and duplicated
│   │       └── invoice.pdf # The generated invoice file
│   ├── xlsx
│
├── src
│   ├── models
│   ├── services
│   ├── controllers
│   ├── routes
│   ├── utils
│   ├── server.ts
│   ├── index.ts
│   └── inversify.config.ts
├── test
│   ├── services
│   ├── routes
│   ├── mocks
│   ├── assets
│   ├── mocha.opts
│   ├── setup.ts
│   └── test_utils.ts
├── tsconfig.json
├── tslint.json
├── nodemon.json
├── README.md
├── package.json
└── yarn.lock
```

#### Writing a new feature

Please follow these steps when you want to write a new feature:
- Ask yourself a question: *Is this new feature going to require the storage of a new model inside the database?*
    - If the answer is **YES**, follow these steps:
        - Create a new Model inside ```src/models/```, following the structure of existing Models. The Schema will
          define how documents are going to be stored inside MongoDB (even if the database itself is loosely-typed).
        - Create a new Service inside ```src/services/``` which extends MongoRepository.
        - Create a new Controller inside ```src/controllers/``` which extends CrudController.
        - Create a new Route inside ```src/routes/``` which extends Route and write the REST bindings to the Controller.
        - **TEST EVERYTHING!** Write tests for the Service and the Route.
        - **DOCUMENTATION!** Write @swagger annotated comments to generate Swagger docs for your new Model and your
          new Route. Plase keep in mind that this project follows Swagger OpenAPI 2.0 written in YAML.
    - If the answer is **NO**, ask yourself another question: *Is this new feature going to add new data inside an
      existing model in the database?*
        - If the answer is **YES**, follow these steps:
            - Modify the existing Model to accomodate for your needs. Remember to also change the @swagger comments!
            - Follow the other branch steps.
        - If the answer is **NO**, ask yourself another question: *Where should I write the code for this new feature?*
            - Inside a Service. Pick the Service most closely related to your new feature and add one (or more)
              functions inside of it. Please keep the number of functions low, otherwise the Services might explode and
              require refactoring by separation of concerns. Write the code for the feature.
            - Add a new method inside the related Controller to call this new feature from the Service.
            - Add a new route REST binding inside the related Route to call the Controller.
            - **TEST THE NEW FEATURE!** Write tests for your new feature (preferably both for the service methods
              themselves and for the REST route bindings, but the latter is not mandatory).
            - **DOCUMENTATION!** Write JSDocs for the new functions you wrote inside a Service. Controller methods do
              not need JSDocs. Write @swagger annoted comments for the new Route you wrote to access the feature.
              
If you actually followed all of these steps, congrats! You just wrote a new feature. I'm proud of you. In case you
didn't follow the steps but wrote a new feature anyways, fuck you that's not a feature that's just your shitcode and I
don't even want to see it. Learn to code you moron.

### Documentation

#### With Swagger
On startup, the server will automatically generate the Swagger API spec and setup a Swagger UI endpoint all on its own!
So just access it at ```{host}:{port}/docs``` while the server is running.

### Develop

This project requires the following packages to be installed on the system: imagemagick, ghostscript, poppler-utils

On Ubuntu:
```shell
$ sudo apt-get install imagemagick ghostscript poppler-utils
```

On OSX:
```shell
$ brew install imagemagick ghostscript poppler
```

On Windows (with [Chocolatey](https://chocolatey.org/)):
```shell
$ choco install imagemagick ghostscript poppler
```

Install the dependencies needed to run this project:
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

---

## Comuni & CAP — refresh del dataset

Il server mantiene una collection `municipalities` seedata in modo idempotente
all'avvio dal file `data/municipalities.json` committato. Il dataset è la
**fusione** di:

1. **CAP_GC Poste Italiane** (`CAP_GC_I_Sem<anno>.xlsx`), pubblicato due volte
   l'anno da Poste — è la fonte autoritativa per CAP, frazioni e grandi centri.
2. **`matteocontrini/comuni-json`** — clone open source dei dati ISTAT, fonte
   per regione, sigla provincia, codice catastale, codice ISTAT.

### Quando rilanciare il refresh

- **Ogni semestre**, quando Poste pubblica un nuovo `CAP_GC_*.xlsx` (gennaio /
  luglio).
- Quando ISTAT aggiorna `comuni-json` (fusioni, scorpori, rinomine).
- Mai a mano sui singoli record: per casi puntuali si usa l'admin endpoint
  `POST /municipality/import` (legacy) descritto sotto.

### Procedura

```shell
# 1) Posiziona i file sorgente in data/source/ :
#      data/source/CAP_GC_I_Sem2025.xlsx        (ufficiale Poste)
#      data/source/comuni-json.json             (matteocontrini/comuni-json)

# 2) Genera il dataset consolidato + checksum
node scripts/build-municipalities.js

# Output:
#   data/municipalities.json        (~12MB, ~8K records)
#   data/municipalities.meta.json   { sha256, count, sourceCAPGC, builtAt }

# 3) Commit dei due file generati. NIENTE in data/source/ (vedi .dockerignore).

# 4) Deploy. Al boot, MunicipalityService.ensureSeeded() rileva il nuovo sha256
#    nel meta file, droppa la collection municipalities e fa bulk-insert.
#    L'operazione è ~1s su 8K record.
```

### Normalizzazione anagrafiche esistenti

Dopo un refresh, le anagrafiche già a sistema (Sender, Recipient) possono
contenere comuni con grafia obsoleta o CAP non più validi. Lo script
`scripts/normalize-addresses.js` gira in dry-run di default e produce un report
CSV di tutti i mismatch:

```shell
# dry run — solo report
MONGO_URI=mongodb://localhost:27017/gsposte_dev node scripts/normalize-addresses.js

# applica le normalizzazioni di grafia (city + province)
MONGO_URI=... node scripts/normalize-addresses.js --apply
```

Il report finisce in `data/normalize-addresses-report-<timestamp>.csv` con
colonne `collection,id,addressKey,city,zip,province,problem,suggestion` e
codici problema `MUNI_NOT_FOUND` / `ZIP_MISMATCH` / `WOULD_NORMALIZE`.

### Endpoint pubblici

I form lato client devono usare:

- `GET /municipality/search?q=<prefisso>&province=<sigla>&limit=<n>` — autocomplete
- `GET /municipality/by-zip/:zip` — lookup CAP, include frazioni
- `GET /municipality/by-istat/:istat` — lookup per codice ISTAT
- `POST /municipality/validate` `{ city, zip, province }` — validate semantica
  pre-submit con suggestions

### Endpoint admin (legacy)

- `POST /municipality/import` (multipart, file JSON in formato `comuni-json`):
  importa **solo** la fonte ISTAT. Perde i CAP estesi del CAP_GC. Usare solo in
  emergenza; resetta lo sha256 in modo che il successivo boot riseedi dal JSON
  canonico.
