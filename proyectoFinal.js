const Process = require("./utils/Process");

const fs = require('fs');

const config = {
    mysql: {
        user: 'root',
        password: 'utt',
        database: 'libreria'
    },
    mongo: {
        url: 'mongodb://localhost:27017',
        database: 'libreria_backup'
    }
};

const metrics = {
    mysql_setup: null,
    create_100k_books: null,
    import_csv_100k: null,
    bulk_insert_3500: null,
    generate_100_csvs: null,
    import_100_csvs: null,
    stats_query: null,
    create_150k_authors: null,
    export_tables_csv: null,

    restore_mysql_from_mongo: null,

    snapshot_mysql: null,
    import_snapshot_mysql:null,

    fail_insert_author: null,
    fail_insert_book: null,
    
    mongo_setup: null,
    mongo_insert_1m: null,
    mongo_export_MySql: null,
};

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function randomYear() {
    return randomInt(1800, 2023);
}

function randomIsbn() {
    return `${randomInt(100, 999)}-${randomInt(10, 99)}-${randomInt(10000, 99999)}-${randomInt(1, 9)}`;
}

async function setupMySQL() {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const mysql = new Process('mysql', { shell: true });
        mysql.ProcessArguments.push(`-u${config.mysql.user}`);
        mysql.ProcessArguments.push(`--password=${config.mysql.password}`);
        try {
            mysql.Execute();
            mysql.Write(`DROP DATABASE IF EXISTS ${config.mysql.database};`);
            mysql.Write(`CREATE DATABASE ${config.mysql.database};`);

            mysql.Write(`        
                CREATE TABLE ${config.mysql.database}.Autor (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    license VARCHAR(12) NOT NULL UNIQUE,
                    name TINYTEXT NOT NULL,
                    lastName TINYTEXT,
                    secondLastName TINYTEXT,
                    year SMALLINT
                );
            `);
            mysql.Write(`
                CREATE TABLE ${config.mysql.database}.Libro (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    ISBN VARCHAR(16) NOT NULL UNIQUE,
                    title VARCHAR(512) NOT NULL,
                    autor_license VARCHAR(12),
                    editorial TINYTEXT,
                    pages SMALLINT,
                    year SMALLINT NOT NULL,
                    genre TINYTEXT,
                    language TINYTEXT NOT NULL,
                    format TINYTEXT,
                    sinopsis TEXT,
                    content TEXT,
                    FOREIGN KEY (autor_license) REFERENCES Autor(license)
                );
            `);

            mysql.Write(`DROP USER IF EXISTS 'usuario_a'@'localhost';`);
            mysql.Write(`DROP USER IF EXISTS 'usuario_b'@'localhost';`);
            mysql.Write(`DROP USER IF EXISTS 'usuario_c'@'localhost';`);

            mysql.Write(`CREATE USER 'usuario_a'@'localhost' IDENTIFIED BY 'password_a';`);
            mysql.Write(`GRANT SELECT, INSERT ON libreria.Libro TO 'usuario_a'@'localhost';`);
            mysql.Write(`GRANT SELECT ON libreria.Autor TO 'usuario_a'@'localhost';`);


            mysql.Write(`CREATE USER 'usuario_b'@'localhost' IDENTIFIED BY 'password_b';`);
            mysql.Write(`GRANT SELECT, INSERT ON libreria.Autor TO 'usuario_b'@'localhost';`)
            mysql.Write(`GRANT SELECT ON libreria.Libro TO 'usuario_b'@'localhost';`);

            mysql.Write(`CREATE USER 'usuario_c'@'localhost' IDENTIFIED BY 'password_c';`);
            mysql.Write(`GRANT SELECT ON libreria.* TO 'usuario_c'@'localhost';`);
            mysql.Write(`FLUSH PRIVILEGES;`);

            metrics.mysql_setup = Date.now() - start;

            mysql.End();
            mysql.Finish();

            resolve(true);
        } catch (err) {
            console.error('MySQL process error:', err);
            reject(err);
        }
    });    
}

async function setupMongoDB() {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const mongo = new Process('mongosh', { shell: true });
        try {
            mongo.Execute();
            mongo.Write(`use ${config.mongo.database};`);
            mongo.Write("\n");
            mongo.Write(`        
                db.createCollection("libros");
                db.createCollection("autores");
                db.libros.createIndex({ ISBN: 1 }, { unique: true });
                db.autores.createIndex({ license: 1 }, { unique: true });
            `);

            mongo.End();
            mongo.Finish();
            resolve(true);
            metrics.mongo_setup = Date.now() - start;

        } catch (err) {
            console.error('Mongo process error:', err);
            reject(err);
        }
    });
            
}

async function executeMySQLQuery(query) {
    return new Promise((resolve, reject) => {
        const mysql = new Process('mysql', { shell: true });
        mysql.ProcessArguments.push(`-u${config.mysql.user}`);
        mysql.ProcessArguments.push(`--password=${config.mysql.password}`);
        try {
            mysql.Execute();
            mysql.Write(`USE ${config.mysql.database};\n`);
            mysql.Write(`${query}\n`);

            mysql.End();
            mysql.Finish().then(()=>{
                    resolve(true);
            }).catch((arr)=>{
                reject(new Error('Mysql'))
            });

            resolve(true);
        } catch (err) {
            console.error('MySQL process error:', err);
            reject(err);
        }
    });
}

async function executeMongoCommand(command) {
    return new Promise((resolve, reject) => {
        const mongo = new Process('mongosh', { shell: true });
        try {
            mongo.Execute();
            mongo.Write(`use ${config.mongo.database};`);
            mongo.Write("\n");
            mongo.Write(command);

            mongo.End();
            mongo.Finish().then(()=>{
                resolve(true);
            }).catch((arr)=>{
                reject(new Error('Mongo'))
            });

            resolve(true);

        } catch (err) {
            console.error('Mongo process error:', err);
            reject(err);
        }
    });
}

async function importCSVToMongoDB(collectionName, filePath, fields) {
    const mongoimport = new Process("mongoimport");
    
    mongoimport.ProcessArguments.push(`--db`);
    mongoimport.ProcessArguments.push(`${config.mongo.database}`);
    mongoimport.ProcessArguments.push("--collection");
    mongoimport.ProcessArguments.push(collectionName);
    mongoimport.ProcessArguments.push("--type");
    mongoimport.ProcessArguments.push("csv");
    mongoimport.ProcessArguments.push("--file");
    mongoimport.ProcessArguments.push(filePath);
    mongoimport.ProcessArguments.push("--fields");
    mongoimport.ProcessArguments.push(fields.join(","));

    try {
        await mongoimport.ExecuteAsync(true);
    } catch (error) {
        console.error("Error al importar CSV:", error);
    }
}

async function exportCSVToMongoDB(collectionName, filePath, fields) {     
    const mongoexport = new Process("mongoexport");
    mongoexport.ProcessArguments.push(`--db`);
    mongoexport.ProcessArguments.push(`${config.mongo.database}`);
    mongoexport.ProcessArguments.push("--collection");
    mongoexport.ProcessArguments.push(collectionName);
    mongoexport.ProcessArguments.push("--out");
    mongoexport.ProcessArguments.push(filePath);
    mongoexport.ProcessArguments.push("--type");
    mongoexport.ProcessArguments.push("csv");
    mongoexport.ProcessArguments.push("--fields");
    mongoexport.ProcessArguments.push(fields.join(","));

    try {
        await mongoexport.ExecuteAsync(true);
    } catch (error) {
        console.error("Error al importar CSV:", error);
    }
}

async function readAuthorLicensesFromFile() {
    return new Promise((resolve, reject) => {
        const licenses = [];
        const filePath = 'C:/backups/author_licenses.csv'; 

        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                return reject(err);
            }

            const lines = data.split('\n');
            lines.forEach(line => {
                if (line) {
                    const columns = line.split(',');
                    licenses.push(columns[0].replace(/"/g, '')); 
                }
            });

            resolve(licenses);
        });
    });
}

async function generateBooksData(count) {

    const authorLicenses = await readAuthorLicensesFromFile();

    const data = [];
    for (let i = 0; i < count; i++) {
        const randomAuthorLicense = authorLicenses[randomInt(0, authorLicenses.length - 1)];

        data.push({
            ISBN: randomIsbn(),
            title: randomString(randomInt(10, 50)),
            autor_license: randomAuthorLicense,
            editorial: randomString(10),
            pages: randomInt(50, 1000),
            year: randomYear(),
            genre: ['Novela', 'Ciencia Ficción', 'Fantasía', 'Terror', 'Biografía'][randomInt(0, 4)],
            language: ['Español', 'Inglés', 'Francés', 'Alemán'][randomInt(0, 3)],
            format: ['Tapa dura', 'Tapa blanda', 'Digital'][randomInt(0, 2)],
            sinopsis: randomString(10),
            content: randomString(10)
        });
    }
    return data;
}

async function generateAuthorsData(count) {
    const data = [];
    const licenses = [];  
    for (let i = 0; i < count; i++) {
        const license = `AUT${i.toString().padStart(6, '0')}`;
        licenses.push(license); 

        data.push({

            license: license,
            name: randomString(10),
            lastName: randomString(10),
            secondLastName: randomString(10),
            year: randomYear()
        });
    }

    let licensesCsv = licenses.map(license => `"${license}"`).join('\n');
    fs.writeFileSync('C:/backups/author_licenses.csv', licensesCsv);

    return data;
}

async function measureMySQLOperations() {
    console.log('Creando 150,000 autores...');
    const startAuthors = Date.now();
    const authorsData = await generateAuthorsData(150000);
    let authorsCsv = authorsData.map(a => 
        `"${a.license}","${a.name}","${a.lastName}","${a.secondLastName}",${a.year}`
    ).join('\n');
    fs.writeFileSync('C:/backups/150k_authors.csv', authorsCsv);
    
    await executeMySQLQuery(`
        LOAD DATA INFILE 'C:/backups/150k_authors.csv'
        INTO TABLE Autor
        FIELDS TERMINATED BY ',' 
        ENCLOSED BY '"' 
        LINES TERMINATED BY '\n'
        (license, name, lastName, secondLastName, year);
    `);
    metrics.create_150k_authors = Date.now() - startAuthors;
    

    console.log('Generando 100,000 libros...');
    const startBooks = Date.now();
    const booksData = await generateBooksData(100000);
    let booksCsv = booksData.map(b => 
        `"${b.ISBN}","${b.title}","${b.autor_license}","${b.editorial}",${b.pages},${b.year},"${b.genre}","${b.language}","${b.format}","${b.sinopsis}","${b.content}"`
    ).join('\n');
    fs.writeFileSync('C:/backups/100k_books.csv', booksCsv);
    metrics.create_100k_books = Date.now() - startBooks;
    
    console.log('Importando 100,000 libros...');
    const startImport = Date.now();
    await executeMySQLQuery(`
        LOAD DATA INFILE 'C:/backups/100k_books.csv' 
        INTO TABLE Libro 
        FIELDS TERMINATED BY ',' 
        ENCLOSED BY '"' 
        LINES TERMINATED BY '\n'
        (ISBN, title, autor_license, editorial, pages, year, genre, language, format, sinopsis, content);
    `);
    metrics.import_csv_100k = Date.now() - startImport;
    
    console.log('Insertando 3,500 libros masivamente...');
    const startBulk = Date.now();
    const bulkData = await generateBooksData(3500);
    const values = bulkData.map(b => 
        `("${b.ISBN}", "${b.title}", "${b.autor_license}", "${b.editorial}", ${b.pages}, ${b.year}, "${b.genre}", "${b.language}", "${b.format}", "${b.sinopsis}", "${b.content}")`
    ).join(',');
    
    await executeMySQLQuery(`
        INSERT INTO Libro 
        (ISBN, title, autor_license, editorial, pages, year, genre, language, format, sinopsis, content) 
        VALUES ${values};
    `);
    metrics.bulk_insert_3500 = Date.now() - startBulk;
    
    console.log('Generando 100 archivos CSV...');
    const startGenCSVs = Date.now();
    for (let i = 0; i < 100; i++) {
        const data = await generateBooksData(1000);
        const csv = data.map(b => 
            `"${b.ISBN}","${b.title}","${b.autor_license}","${b.editorial}",${b.pages},${b.year},"${b.genre}","${b.language}","${b.format}","${b.sinopsis}","${b.content}"`
        ).join('\n');
        fs.writeFileSync(`C:/backups/books_${i}.csv`, csv);
    }
    metrics.generate_100_csvs = Date.now() - startGenCSVs;
    
    console.log('Importando 100 archivos CSV...');
    const startImportCSVs = Date.now();
    for (let i = 0; i < 100; i++) {
        await executeMySQLQuery(`
            LOAD DATA INFILE 'C:/backups/books_${i}.csv' 
            INTO TABLE Libro 
            FIELDS TERMINATED BY ',' 
            ENCLOSED BY '"' 
            LINES TERMINATED BY '\n'
            (ISBN, title, autor_license, editorial, pages, year, genre, language, format, sinopsis, content);
        `);
    }
    metrics.import_100_csvs = Date.now() - startImportCSVs;
    
    console.log('Ejecutando consulta de estadísticas...');
    const startStats = Date.now();
    await executeMySQLQuery(`
        SELECT 
            MAX(pages) as max_pages,
            MIN(pages) as min_pages,
            AVG(pages) as avg_pages,
            MAX(year) as newest_year,
            MIN(year) as oldest_year,
            COUNT(*) as total_books
        FROM Libro;
    `);
    metrics.stats_query = Date.now() - startStats;
    
    console.log('Exportando tablas a CSV...');
    const startExport = Date.now();
    await executeMySQLQuery(`
        SELECT * FROM Libro 
        INTO OUTFILE 'C:/backups/libros_export.csv' 
        FIELDS TERMINATED BY ',' 
        ENCLOSED BY '"' 
        LINES TERMINATED BY '\n'
    `);
    await executeMySQLQuery(`
        SELECT * FROM Autor 
        INTO OUTFILE 'C:/backups/autores_export.csv' 
        FIELDS TERMINATED BY ',' 
        ENCLOSED BY '"' 
        LINES TERMINATED BY '\n'
    `);
    metrics.export_tables_csv = Date.now() - startExport;
}

async function measureFullMigration() {
    const startFullMigration = Date.now();
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    console.log('Respaldando tablas de MySQL...');

    await executeMySQLQuery(`
        SELECT * FROM Autor 
        INTO OUTFILE 'C:/backups/autores_mysql_export.csv' 
        FIELDS TERMINATED BY ',' 
        ENCLOSED BY '"' 
        LINES TERMINATED BY '\n'
    `);
    await sleep(10000);

    await executeMySQLQuery(`
        SELECT * FROM Libro 
        INTO OUTFILE 'C:/backups/libros_mysql_export.csv' 
        FIELDS TERMINATED BY ',' 
        ENCLOSED BY '"' 
        LINES TERMINATED BY '\n'
    `);
    await sleep(10000);


    console.log('Eliminando tablas de MySQL...');
    await executeMySQLQuery('DROP TABLE Libro;');
    await executeMySQLQuery('DROP TABLE Autor;');

    console.log('Insertando CSV en MongoDB...');
    await importCSVToMongoDB(
        "autores", 
        "C:/backups/autores_mysql_export.csv", 
        ["id", "license", "name", "lastName", "secondLastName", "year"]
    );
    await importCSVToMongoDB(
        "libros", 
        "C:/backups/libros_mysql_export.csv", 
        ['id', 'ISBN', 'title', 'autor_license', 'editorial', 'pages', 'year', 'genre', 'language', 'format', 'sinopsis', 'content']
    );
        
        
    console.log('Exportando desde MongoDB y restaurando en MySQL...');

    await exportCSVToMongoDB(
        "autores", 
        "C:/backups/autores_mongo_export.csv", 
        ["id", "license", "name", "lastName", "secondLastName", "year"]
    );

    await exportCSVToMongoDB(
        "libros", 
        "C:/backups/libros_mongo_export.csv", 
        ['id', 'ISBN', 'title', 'autor_license', 'editorial', 'pages', 'year', 'genre', 'language', 'format', 'sinopsis', 'content']
    );
    

    console.log('Creando tablas y exportando archivos en MySQL...');

    await executeMySQLQuery(`
        CREATE TABLE Autor (
            id INT AUTO_INCREMENT PRIMARY KEY,
            license VARCHAR(12) NOT NULL UNIQUE,
            name TINYTEXT NOT NULL,
            lastName TINYTEXT,
            secondLastName TINYTEXT,
            year SMALLINT
        );
    `);
    
    await executeMySQLQuery(`
        CREATE TABLE Libro (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ISBN VARCHAR(16) NOT NULL UNIQUE,
            title VARCHAR(512) NOT NULL,
            autor_license VARCHAR(12),
            editorial TINYTEXT,
            pages SMALLINT,
            year SMALLINT NOT NULL,
            genre TINYTEXT,
            language TINYTEXT NOT NULL,
            format TINYTEXT,
            sinopsis TEXT,
            content TEXT,
            FOREIGN KEY (autor_license) REFERENCES Autor(license)
        );
    `);
    
    await executeMySQLQuery(`
        LOAD DATA INFILE 'C:/backups/autores_mongo_export.csv' 
        INTO TABLE Autor 
        FIELDS TERMINATED BY ','    
        ENCLOSED BY '"'           
        LINES TERMINATED BY '\n'  
        IGNORE 1 ROWS 
        (id, license, name, lastName, secondLastName, year);
    `);
    await sleep(10000);

    await executeMySQLQuery(`
        LOAD DATA INFILE 'C:/backups/libros_mongo_export.csv' 
        INTO TABLE Libro 
        FIELDS TERMINATED BY ','    
        ENCLOSED BY '"'           
        LINES TERMINATED BY '\n'
        IGNORE 1 ROWS 
        (id, ISBN, title, autor_license, editorial, pages, year, genre, language, format, sinopsis, content);
    `);
    metrics.restore_mysql_from_mongo = Date.now() - startFullMigration;
    await sleep(10000);

}

async function mysqlSnapshot() {
    const startTime = Date.now();
    const mysqldump = new Process("mysqldump",{shell : true});
    mysqldump.ProcessArguments.push(`-u${config.mysql.user}`);
    mysqldump.ProcessArguments.push(`-p${config.mysql.password}`);
    mysqldump.ProcessArguments.push(`${config.mysql.database}`);
    mysqldump.ProcessArguments.push("--result-file=C:/backups/snapshot_library.sql");

    try {
        await mysqldump.ExecuteAsync(true);
        metrics.snapshot_mysql = Date.now() - startTime;
    } catch (error) {
        console.error("Error al ejecutar el mysqldump:", error);
    }
}

async function mysqlImportSnapshot() {
    const startTime = Date.now();

    const dropMysql = new Process("mysql"); 
    dropMysql.ProcessArguments.push(`-u${config.mysql.user}`);
    dropMysql.ProcessArguments.push(`-p${config.mysql.password}`);
    dropMysql.Execute();
    dropMysql.Write(`DROP DATABASE IF EXISTS ${config.mysql.database};\n`);
    dropMysql.Write(`CREATE DATABASE ${config.mysql.database};\n`);
    dropMysql.End();
    await dropMysql.Finish();
    
    const mysqlImport = new Process("mysql", { shell: true });
    mysqlImport.ProcessArguments.push(`-u${config.mysql.user}`);
    mysqlImport.ProcessArguments.push(`-p${config.mysql.password}`);
    mysqlImport.ProcessArguments.push(`${config.mysql.database}`); 

    mysqlImport.ProcessArguments.push("<");
    mysqlImport.ProcessArguments.push(`C:/backups/snapshot_library.sql`);

    await mysqlImport.ExecuteAsync(true); 

    metrics.import_snapshot_mysql = Date.now() - startTime; 
}


async function userInsertFail() {
    
    console.log('Probando fallo al insertar autor...');

    return new Promise((resolve, reject) => {
        const mysql = new Process('mysql', { shell: true });
        mysql.ProcessArguments.push(`-uusuario_c`);
        mysql.ProcessArguments.push(`--password=password_c`);
        try {
            const startFailAuthor = Date.now();
            mysql.Execute();
            mysql.Write(`DROP DATABASE IF EXISTS ${config.mysql.database};`);
            mysql.Write(`CREATE DATABASE ${config.mysql.database};`);
            mysql.Write('INSERT INTO Autor (license, name, lastName, secondLastName, year) VALUES ("TEST123", "Test Author","Test Last Name", "Test Second Last Name", 1999);',
                'usuario_c',
                'password_c')  
            metrics.fail_insert_author = Date.now() - startFailAuthor;
            
            const startFailBook = Date.now();
            mysql.Write('INSERT INTO Libro (ISBN, title, autor_license, editorial, pages, year, genre, language, format, sinopsis, content) VALUES ("123-45-67890-1", "Test Book", "TEST123", "AAAA", 1111, 1111, "AAA", "AAA", "AAA", "AAA", "AAA");',
            'usuario_c',
            'password_c'
            )
            metrics.fail_insert_book = Date.now() - startFailBook;


            mysql.End();
            mysql.Finish();``

            resolve(true);
        } catch (err) {
            console.error('MySQL process error:', err);
            reject(err);
        }
    });   

}

async function measureMongoDBOperations() {
    console.log('Generando e insertando 1,000,000 de libros en MongoDB...');
    const startMongoInsert = Date.now();
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const batchSize = 1000;
    const totalBatches = 5;
    
    for (let i = 0; i < totalBatches; i++) {
        console.log(`Insertando lote ${i + 1} de ${totalBatches}...`);
        const batchData = await generateBooksData(batchSize);
        const documents = batchData.map(doc => JSON.stringify(doc).replace(/'/g, "\\'")).join(',');
        await executeMongoCommand(`
            db.libros.insertMany([${documents}]);
        `, config.mongo.database);
        await sleep(10000); 

    }
    
    
    console.log('Exportando datos específicos desde MongoDB a MySQL...');
    await exportCSVToMongoDB(
        "libros", 
        "C:/backups/old_books_export.csv", 
        ['ISBN','pages', 'year']
    );

    metrics.mongo_insert_1m = Date.now() - startMongoInsert;

    const startMongoExport = Date.now();

    await executeMySQLQuery(`
        CREATE TABLE IF NOT EXISTS libreria.old_books (
            ISBN VARCHAR(16) NOT NULL UNIQUE,
            pages SMALLINT,
            \`year\` SMALLINT NOT NULL
        );
    `);

    await executeMySQLQuery(`
        LOAD DATA INFILE 'C:/backups/old_books_export.csv' 
        INTO TABLE old_books 
        FIELDS TERMINATED BY ','    
        ENCLOSED BY '"'           
        LINES TERMINATED BY '\n'
        IGNORE 1 ROWS 
        (ISBN, pages, year);
    `);
    
    metrics.mongo_export_MySql = Date.now() - startMongoExport;
}

function generateReport() {
    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Reporte de Rendimiento - Libros y Autores</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1, h2 { color: #333; }
            .chart-container { width: 80%; margin: 20px auto; }
            table { width: 90%; border-collapse: collapse; margin: 20px auto; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background-color: #f2f2f2; }
            tr:nth-child(even) { background-color: #f9f9f9; }
        </style>
    </head>
    <body>
        <h1>Reporte de Rendimiento - Sistema de Libros y Autores</h1>

        <h2>MySQL</h2>
        <div class="chart-container">
            <canvas id="mysqlChart"></canvas>
        </div>

        <h2>MongoDB</h2>
        <div class="chart-container">
            <canvas id="mongoChart"></canvas>
        </div>

        <h2>Migración</h2>
        <div class="chart-container">
            <canvas id="migrationChart"></canvas>
        </div>

        <table>
            <tr>
                <th>Operación</th>
                <th>Tiempo (ms)</th>
                <th>Sistema</th>
            </tr>
            <tr><td>Configuración inicial MySQL</td><td>${metrics.mysql_setup}</td><td>MySQL</td></tr>
            <tr><td>El tiempo que toma crear 100,000 Libros en la Base de Datos usando datos aleatorios en CSV</td><td>${metrics.create_100k_books}</td><td>MySQL</td></tr>
            <tr><td>Insertar CSV de 100,000 libros</td><td>${metrics.import_csv_100k}</td><td>MySQL</td></tr>
            <tr><td>El tiempo que toma insertar masivamente, estresando la base de datos con 3,500 Libros</td><td>${metrics.bulk_insert_3500}</td><td>MySQL</td></tr>
            <tr><td>El tiempo que toma generar 100 archivos CSV, donde cada archivo incluye 1000 Libros</td><td>${metrics.generate_100_csvs}</td><td>MySQL</td></tr>
            <tr><td>El tiempo que toma insertar los 100 archivos a MySQL</td><td>${metrics.import_100_csvs}</td><td>MySQL</td></tr>
            <tr><td>El tiempo que toma obtener en 1 solo query: El mayor número de paginas, menor número de páginas, el promedio de número de páginas, el año más cercano a la actualidad, el año más antigüo, y el número total de libros.</td><td>${metrics.stats_query}</td><td>MySQL</td></tr>
            <tr><td>El tiempo que toma generar 150,000 Autores</td><td>${metrics.create_150k_authors}</td><td>MySQL</td></tr>
            <tr><td>El tiempo que toma exportar ambas tablas a CSV</td><td>${metrics.export_tables_csv}</td><td>MySQL</td></tr>

            <tr><td>El tiempo que toma respaldar ambas tablas a MongoDB, eliminarlas de MySQL, exportar el respaldo de MongoDB y restaurarlo en MySQL.</td><td>${metrics.restore_mysql_from_mongo}</td><td>MySQL</td></tr>

            <tr><td>El tiempo que toma hacer el dump de toda la base de datos de MySQL ("Snapshot")</td><td>${metrics.snapshot_mysql}</td><td>MySQL</td></tr>
            <tr><td>El tiempo que toma importar de nuevo todo el "snapshot" de la base de datos</td><td>${metrics.import_snapshot_mysql}</td><td>MySQL</td></tr>


            <tr><td>Usando un usuario diferente a 'A' y 'B', mida el tiempo que toma fallar cuando intenta insertar un Autor(usuario no autorizado)</td><td>${metrics.fail_insert_author}</td><td>MySQL</td></tr>
            <tr><td>Usando un usuario diferente a 'A' y 'B', mida el tiempo que toma fallar cuando intenta insertar un Libro</td><td>${metrics.fail_insert_book}</td><td>MySQL</td></tr>

            <tr><td>Configuración inicial MongoDB</td><td>${metrics.mongo_setup}</td><td>MongoDB</td></tr>
            <tr><td>Por último, genere 1,000,000 de datos en MongoDB para libros, exporte solamente los campos: ISBN, year y pages a un CSV</td><td>${metrics.mongo_insert_1m}</td><td>MongoDB</td></tr>
            <tr><td>De este CSV, cree una tabla nueva llamada "old_books" en MySQL e importe los datos del CSV anterior</td><td>${metrics.mongo_export_MySql}</td><td>MongoDB</td></tr>

        </table>

        <script>
            // Gráfico MySQL
            const mysqlCtx = document.getElementById('mysqlChart').getContext('2d');
            new Chart(mysqlCtx, {
                type: 'bar',
                data: {
                    labels: [
                        'Setup', '100K libros', 'Import 100K', 'Bulk 3.5K', 
                        'Gen. 100 CSV', 'Import 100 CSV', 'Stats', '150K autores',
                        'Export CSV', 'Dump', 'Import dump', 'Restore', 'Fallo autor', 'Fallo libro'
                    ],
                    datasets: [{
                        label: 'MySQL - Tiempo (ms)',
                        data: [
                            ${metrics.mysql_setup}, ${metrics.create_100k_books}, ${metrics.import_csv_100k}, 
                            ${metrics.bulk_insert_3500}, ${metrics.generate_100_csvs}, ${metrics.import_100_csvs}, 
                            ${metrics.stats_query}, ${metrics.create_150k_authors}, ${metrics.export_tables_csv}, 
                            ${metrics.snapshot_mysql}, ${metrics.import_snapshot_mysql}, 
                            ${metrics.restore_mysql_from_mongo},
                            ${metrics.fail_insert_author}, ${metrics.fail_insert_book}
                        ],
                        backgroundColor: 'rgba(54, 162, 235, 0.5)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    }]
                },
                options: { responsive: true, scales: { y: { beginAtZero: true } } }
            });

            // Gráfico MongoDB
            const mongoCtx = document.getElementById('mongoChart').getContext('2d');
            new Chart(mongoCtx, {
                type: 'bar',
                data: {
                    labels: ['Setup', 'Insert 1M libros', 'Export a MySQL'],
                    datasets: [{
                        label: 'MongoDB - Tiempo (ms)',
                        data: [
                            ${metrics.mongo_setup}, ${metrics.mongo_insert_1m}, ${metrics.mongo_export_MySql}
                        ],
                        backgroundColor: 'rgba(75, 192, 192, 0.5)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    }]
                },
                options: { responsive: true, scales: { y: { beginAtZero: true } } }
            });

        </script>
    </body>
    </html>
    `;

    fs.writeFileSync('reporte_rendimiento_integrado.html', html);
    console.log('Reporte generado: reporte_rendimiento_integrado.html');
}

async function main() {
    try {
        await setupMySQL();
        await setupMongoDB();
        
        console.log('Ejecutando operaciones en MySQL...');
        await measureMySQLOperations();
        
        console.log('Probando migración completa entre sistemas...');
        await measureFullMigration();

        console.log('Generando snapshot en MYSQL...');
        await mysqlSnapshot();
        
        console.log('Importando snapshot en MYSQL...');
        await mysqlImportSnapshot();

        console.log('Ejecutando los fallos del usuario...');
        await userInsertFail();

        console.log('Ejecutando operaciones en MongoDB...');
        await measureMongoDBOperations();
        
        console.log('Generando reporte...');
        generateReport();
        
        console.log('¡Todas las operaciones completadas!');
    } catch (error) {
        console.error('Error en la ejecución:', error);
    }
}

main();