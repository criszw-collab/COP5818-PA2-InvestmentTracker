PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
 id INTEGER PRIMARY KEY,
 name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS purchases (
 id INTEGER PRIMARY KEY,
 owner_id INTEGER NOT NULL REFERENCES users(id),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
 quantity INTEGER NOT NULL CHECK(typeof(quantity)='integer' AND quantity BETWEEN 1 AND 10000),
 unit_price_cents INTEGER NOT NULL CHECK(typeof(unit_price_cents)='integer' AND unit_price_cents BETWEEN 1 AND 100000000),
 category_id INTEGER NOT NULL REFERENCES categories(id)
);
INSERT OR IGNORE INTO categories(id,name) VALUES (1,'Fund'),(2,'Stock'),(3,'Other');
