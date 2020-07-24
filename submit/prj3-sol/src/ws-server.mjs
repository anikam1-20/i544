import assert from 'assert';
//import cors from 'cors';
import express from 'express';
import bodyParser from 'body-parser';
import querystring from 'querystring';

import ModelError from './model-error.mjs';
import { get } from 'http';

//not all codes necessary
const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const CONFLICT = 409;
const SERVER_ERROR = 500;

const BASE = 'api';
const BOOKS_BASE = 'books';
const CART_BASE = 'cart';

export default function serve(port, meta, model) {
  const app = express();
  app.locals.port = port;
  app.locals.meta = meta;
  app.locals.model = model;
  setupRoutes(app);
  app.listen(port, function () {
    console.log(`listening on port ${port}`);
  });
}

function setupRoutes(app) {
  //app.use(cors());

  //pseudo-handlers used to set up defaults for req
  app.use(bodyParser.json());      //always parse request bodies as JSON
  app.use(reqSelfUrl, reqBaseUrl); //set useful properties in req

  //application routes
  app.get(`/${BASE}`, doBase(app));
  app.get(`/${BASE}/books`, doFind(app));
  app.get(`/${BASE}/books/:isbn`, doFindISBN(app));
  app.post(`/${BASE}/carts`, doCreateCart(app));
  app.get(`/${BASE}/carts/:cartId`, doGetCart(app));
  app.patch(`/${BASE}/carts/:cartId`, doUpdateCart(app));
  //@TODO: add other application routes

  //must be last
  app.use(do404(app));
  app.use(doErrors(app));
}

/****************************** Handlers *******************************/

/** Sets selfUrl property on req to complete URL of req,
 *  including query parameters.
 */
function reqSelfUrl(req, res, next) {
  const port = req.app.locals.port;
  req.selfUrl = `${req.protocol}://${req.hostname}:${port}${req.originalUrl}`;
  next();  //absolutely essential
}

/** Sets baseUrl property on req to complete URL of BASE. */
function reqBaseUrl(req, res, next) {
  const port = req.app.locals.port;
  req.baseUrl = `${req.protocol}://${req.hostname}:${port}/${BASE}`;
  next(); //absolutely essential
}

function doBase(app) {
  return function (req, res) {
    try {
      const links = [
        { rel: 'self', name: 'self', href: req.selfUrl, },
        //links for book and cart collections
        { rel: 'collection', name: 'books', href: req.selfUrl + `/books`, },
        { rel: 'collection', name: 'carts', href: req.selfUrl + `/carts`, },
      ];
      res.json({ links });
    }
    catch (err) {
      const mapped = mapError(err);
      res.status(mapped.status).json(mapped);
    }
  };
}

//@TODO: Add handlers for other application routes

/**
 * Search the books based on query parameters specified in the URL using the   
 * findBooks() method from model.mjs 
 */
function doFind(app) {
  return async function (req, res) {
    try {
      const searchQuery = req.query;
      const getIndex = req.query._index;
      //console.log(getIndex);
      const results = await app.locals.model.findBooks(searchQuery);
      //console.log(results);

      const finalR = results.map(obj => ({
        ...obj,
        links: {
          href: req.selfUrl.slice(0, req.selfUrl.lastIndexOf("?")) + `/${obj.isbn}`,
          name: `book`,
          rel: "details"
        }
      }))

      res.json({ links: [{ href: req.selfUrl, name: `self`, rel: "self" }], result: finalR });
    }
    catch (err) {
      const message = `At least one search field must be specified.`;
      const result = {
        status: NOT_FOUND,
        errors: [{ code: 'FORM_ERROR', message, name: "" },],
      };
      res.type('text').
        status(400).
        json(result);
    }
  };
}

/**
 * Search the book based on specified isbn of the book in the URL using the   
 * findBooks() method from model.mjs. Also checks if the specified isbn is present in the database/books catalog
 */
function doFindISBN(app) {
  return async function (req, res) {
    try {
      const searchisbn = req.params.isbn;
      //console.log(q);
      const results = await app.locals.model.findBooks({ isbn: searchisbn });
      if (results.length === 0) {
        const message = `no book for isbn ${searchisbn}`;
        const result = {
          status: NOT_FOUND,
          errors: [{ code: 'BAD_ID', message, name: "isbn" },],
        };
        res.type('text').
          status(404).
          json(result);
      }
      else {
        //        console.log(results);
        res.json({ links: [{ href: req.selfUrl, rel: `self`, name: "self" }], result: results });
      }
    }
    catch (err) {
      const mapped = mapError(err);
      res.status(mapped.status).json(mapped);
    }
  };
}

/**
 * Creates new cart using the newCart() from the model.mjs
 */
function doCreateCart(app) {
  return async function (req, res) {
    try {
      const obj = req.body;
      //console.log(obj);
      const results = await app.locals.model.newCart(obj);
      //console.log(results);
      res.append('Location', req.selfUrl + '/' + results);
      res.sendStatus(CREATED);
      res.end();
    }
    catch (err) {
      const mapped = mapError(err);
      res.status(mapped.status).json(mapped);
    }
  };
}

/**
 * Retrieves the specified cart contents.
 * 
 */
function doGetCart(app) {
  //console.log("in Get Cart")
  return async function (req, res) {
    try {
      //console.log("hey")
      const q = req.params.cartId;
      //console.log(q);
      const results = await app.locals.model.getCart({ cartId: q });
      //console.log([results]);
      const items = Object.entries(results).filter(([k, v]) => k !== '_id' && v > 0);

      if (items.length >= 2) {
        items.shift();
        //console.log(items);
        const finalR = items.map((obj, i) => ({
          links: {
            href: req.selfUrl.slice(0, req.selfUrl.lastIndexOf("carts")) + `books/${obj.slice(0, obj.lastIndexOf(","))}`,
            name: "book",
            rel: `item`
          },
          nUnits: `${obj.toString().split(",")[1]}`,
          sku: `${obj.slice(0, obj.lastIndexOf(","))}`
        }))
        res.json({ _lastModified: results._lastModified, links: [{ href: req.selfUrl, rel: `self`, name: "self" }], result: finalR });
      }
      else {
        res.json({ _lastModified: results._lastModified, links: [{ href: req.selfUrl, rel: `self`, name: "self" }], result: results });
      }
    }
    catch (err) {
      //console.log("error")

      const mapped = mapError(err);
      res.status(mapped.status).json(mapped);
    }
  };
}

/**
 * Updates sku and nUnits of the books in the cart.
 */
function doUpdateCart(app) {
  return async function (req, res) {
    try {
      const patch = Object.assign({}, req.body);
      patch.cartId = req.params.cartId;
      const results = await app.locals.model.cartItem(patch);
      res.sendStatus(OK);
      //res.json(results);
    }
    catch (err) {
      const mapped = mapError(err);
      res.status(mapped.status).json(mapped);
    }
  };
}

/** Default handler for when there is no route for a particular method
 *  and path.
 */
function do404(app) {
  return async function (req, res) {
    const message = `${req.method} not supported for ${req.originalUrl}`;
    const result = {
      status: NOT_FOUND,
      errors: [{ code: 'NOT_FOUND', message, },],
    };
    res.type('text').
      status(404).
      json(result);
  };
}


/** Ensures a server error results in nice JSON sent back to client
 *  with details logged on console.
 */
function doErrors(app) {
  return async function (err, req, res, next) {
    const result = {
      status: SERVER_ERROR,
      errors: [{ code: 'SERVER_ERROR', message: err.message }],
    };
    res.status(SERVER_ERROR).json(result);
    console.error(err);
  };
}


/*************************** Mapping Errors ****************************/

const ERROR_MAP = {
  BAD_ID: NOT_FOUND,
}

/** Map domain/internal errors into suitable HTTP errors.  Return'd
 *  object will have a "status" property corresponding to HTTP status
 *  code and an errors property containing list of error objects
 *  with code, message and name properties.
 */
function mapError(err) {
  const isDomainError =
    (err instanceof Array && err.length > 0 && err[0] instanceof ModelError);
  const status =
    isDomainError ? (ERROR_MAP[err[0].code] || BAD_REQUEST) : SERVER_ERROR;
  const errors =
    isDomainError
      ? err.map(e => ({ code: e.code, message: e.message, name: e.name }))
      : [{ code: 'SERVER_ERROR', message: err.toString(), }];
  if (!isDomainError) console.error(err);
  return { status, errors };
}

/****************************** Utilities ******************************/



