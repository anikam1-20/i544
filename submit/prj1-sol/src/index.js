import './style.css';

import $, { isNumeric } from 'jquery';        //make jquery() available as $
import Meta from './meta.js';  //bundle the input to this program

//default values
const DEFAULT_REF = '_';       //use this if no ref query param
const N_UNI_SELECT = 4;        //switching threshold between radio & select
const N_MULTI_SELECT = 4;      //switching threshold between checkbox & select

/*************************** Utility Routines **************************/

/** Return `ref` query parameter from window.location */
function getRef() {
  const url = new URL(window.location);
  const params = url.searchParams;
  return params && params.get('ref');
}

/** Return window.location url with `ref` query parameter set to `ref` */
function makeRefUrl(ref) {
  const url = new URL(window.location);
  url.searchParams.set('ref', ref);
  return url.toString();
}

/** Return a jquery-wrapped element for tag and attr */
function makeElement(tag, attr = {}) {
  const $e = $(`<${tag}/>`);
  Object.entries(attr).forEach(([k, v]) => $e.attr(k, v));
  return $e;
}

/** Given a list path of accessors, return Meta[path].  Handle
 *  occurrences of '.' and '..' within path.
 */
function access(path) {
  const normalized = path.reduce((acc, p) => {
    if (p === '.') {
      return acc;
    }
    else if (p === '..') {
      return acc.length === 0 ? acc : acc.slice(0, -1)
    }
    else {
      return acc.concat(p);
    }
  }, []);
  return normalized.reduce((m, p) => m[p], Meta);
}

/** Return an id constructed from list path */
function makeId(path) { return ('/' + path.join('/')); }

function getType(meta) {
  return meta.type || 'block';
}

/** Return a jquery-wrapped element <tag meta.attr>items</tag>
 *  where items are the recursive rendering of meta.items.
 *  The returned element is also appended to $element.
 */
function items(tag, meta, path, $element) {
  const $e = makeElement(tag, meta.attr);
  (meta.items || []).
    forEach((item, i) => render(path.concat('items', i), $e));
  $element.append($e);
  return $e;
}

/************************** Event Handlers *****************************/

//@TODO

function checkValidation($element, meta, eventType, path) {

  if (meta.required || meta.chkFn) {
    $element.on(eventType, function (e) {
      const $valueT = $(e.target).val();
      const errorID = (meta.attr.id || makeId(path)) + "-err";
      const getErrorDivElement = ('div[id="' + errorID + '"]');

      if ($(e.target).attr("type") === "checkbox" || $(e.target).attr("type") === "radio") {
        const getParentDiv = $(e.target).parent().get(0).tagName;
        if ($(getParentDiv + " input:checkbox:checked").length === 0) {
          $(getErrorDivElement).text(meta.required ? `The field ${meta.text} must be specified.` : "")
        }
        else {
          $(getErrorDivElement).text("");
        }
      }

      else if ($(e.target).attr("type") === "radio") {
        const getParentDiv = $(e.target).parent().get(0).tagName;
        if ($(getParentDiv + " input:radio:checked").length === 0) {
          $(getErrorDivElement).text(meta.required ? `The field ${meta.text} must be specified.` : "")
        }
        else {
          $(getErrorDivElement).text("");
        }
      }

      else if (($valueT.length === 0)) {
        $(getErrorDivElement).text(meta.required ? `The field ${meta.text} must be specified.` : "")
      }
      else {
        if (meta.chkFn) {
          $(getErrorDivElement).text(meta.chkFn($valueT, meta, meta) ? "" : (meta.errMsgFn ? meta.errMsgFn($valueT, meta, meta) : ("invalid input " + $valueT)))
        }
        else {
          $(getErrorDivElement).text("");
        }
      }
    })
  }
}

/********************** Type Routine Common Handling *******************/

//@TODO


/***************************** Type Routines ***************************/

//A type handling function has the signature (meta, path, $element) =>
//void.  It will append the HTML corresponding to meta (which is
//Meta[path]) to $element.

function block(meta, path, $element) { items('div', meta, path, $element); }

function form(meta, path, $element) {
  const $form = items('form', meta, path, $element);
  $form.submit(function (event) {
    event.preventDefault();
    const $form = $(this);
    $("input,select,textarea", $form).trigger("blur"),
      $("input,select", $form).trigger("change");

    //@TODO
    if (!$(".error", $form).toArray().some(meta => meta.innerHTML.trim().length > 0)) {
      const $element = {};
      const $results = $form.serializeArray();
      $results.forEach(({ name: $results, value: $value }) => {
        if (($results === "multiSelect") || ($results === "primaryColors")) {
          $element[$results] = ($element[$results] || []).concat($value)
        }
        else {
          $element[$results] = $value;
        }
      }),
        console.log(JSON.stringify($element, null, 2));
    }
  }
  );

}

function header(meta, path, $element) {
  const $e = makeElement(`h${meta.level || 1}`, meta.attr);
  $e.text(meta.text || '');
  $element.append($e);
}

function input(meta, path, $element) {
  //@TODO
  const $makeLabel = makeElement("label", Object.assign({}, meta.attr, { for: meta.attr.id || makeId(path) }));
  $makeLabel.text(meta.text || '').append(meta.required ? "*" : "");
  $element.append($makeLabel);

  const $makeDiv = makeElement("div");

  //check if the subType is textarea
  if (meta.subType === "textarea") {
    const $makeTA = makeElement("textarea", meta.attr);
    $makeDiv.append($makeTA);
    $element.append($makeDiv);

  }
  else {
    const $makeInput = makeElement("input", Object.assign({}, meta.attr, { type: meta.subType, id: meta.attr.id || makeId(path) }));
    $makeDiv.append($makeInput);
    $element.append($makeDiv);
    checkValidation($makeInput, meta, "blur", path); //check for validations
  }

  //create error div
  const $makeErrorDiv = makeElement("div", Object.assign({}, meta.attr || {}, { class: "error", id: meta.attr.id || makeId(path) + "-err" }));
  $makeDiv.append($makeErrorDiv);
}

function link(meta, path, $element) {
  const parentType = getType(access(path.concat('..')));
  const { text = '', ref = DEFAULT_REF } = meta;
  const attr = Object.assign({}, meta.attr || {}, { href: makeRefUrl(ref) });
  $element.append(makeElement('a', attr).text(text));
}

function multiSelect(meta, path, $element) {
  //@TODO
  const $makeLabel = makeElement("label", Object.assign({}, meta.attr, { for: meta.attr.id || makeId(path) }));
  $makeLabel.text(meta.text || '').append(meta.required ? "*" : "");
  $element.append($makeLabel);
  const $makeDiv = makeElement("div");

  const Mattr = meta.attr || {};
  if (meta.items.length > (Meta._options.N_MULTI_SELECT || 4)) {
    const $makeSelect = makeElement("select", Object.assign({}, Mattr, { multiple: true }));
    $makeDiv.append($makeSelect);
    meta.items.forEach(({ key: $element, text: meta }) => {
      const $makeOption = makeElement("option", { value: $element });  //create option tag 
      $makeOption.text(meta);
      $makeSelect.append($makeOption);    //append option tag to select
    })
    $element.append($makeDiv);
    checkValidation($makeSelect, meta, "change", path); //check for validations
  }
  else {
    const $makeDivforRadio = makeElement("div", { class: 'fieldset' });
    $makeDiv.append($makeDivforRadio);
    const Attr = meta.attr || {};
    (meta.items || []).forEach(({ key: $element, text: meta }, i = 0) => {
      const $makeLabel = makeElement("label", Object.assign({}, Attr, { for: makeId(path) }));
      $makeDivforRadio.append($makeLabel.text($element));
      const $makeInputTag = makeElement("input", Object.assign({}, Attr, {
        value: $element,
        type: "checkbox",
        id: makeId(path) + "-" + i++
      }))
      $makeDivforRadio.append($makeInputTag);
    })
    $element.append($makeDiv);
    checkValidation($makeDivforRadio, meta, "change", path);  //check for validations
  }

  //create error div
  const $makeErrorDiv = makeElement("div", Object.assign({}, meta.attr || {}, { class: "error", id: meta.attr.id || makeId(path) + "-err" }));
  $makeDiv.append($makeErrorDiv);

}

function para(meta, path, $element) { items('p', meta, path, $element); }

function segment(meta, path, $element) {
  if (meta.text !== undefined) {
    $element.append(makeElement('span', meta.attr).text(meta.text));
  }
  else {
    items('span', meta, path, $element);
  }
}


function submit(meta, path, $element) {

  //create empty div and append to $element
  const $makeSubmitDiv = makeElement("div");
  $element.append($makeSubmitDiv);

  //create Submit button, assign meta.text and append to $element
  const $makeSubmitButton = makeElement("button", Object.assign({}, meta.attr, { type: "submit" }))
  $makeSubmitButton.text(meta.text || "Submit");
  $element.append($makeSubmitButton);

}

function uniSelect(meta, path, $element) {
  //@TODO
  const $makeLabel = makeElement("label", Object.assign({}, meta.attr, { for: meta.attr.id || makeId(path) }));
  $makeLabel.text(meta.text || '').append(meta.required ? "*" : "");
  $element.append($makeLabel);
  const $makeDiv = makeElement("div");

  if (meta.items.length > (Meta._options.N_UNI_SELECT || 4)) {
    const $makeSelect = makeElement("select", meta.attr);
    $makeDiv.append($makeSelect);
    meta.items.forEach(({ key: $element, text: meta }) => {
      const $makeOption = makeElement("option", { value: $element });  //create option tag 
      $makeOption.text(meta);
      $makeSelect.append($makeOption);    //append option tag to select
    })
    $element.append($makeDiv);
    checkValidation($makeSelect, meta, "change", path); //check for validations
  }
  else {
    const $makeDivforRadio = makeElement("div", { class: 'fieldset' });
    $makeDiv.append($makeDivforRadio);
    const Attr = meta.attr || {};
    (meta.items || []).forEach(({ key: $element, text: meta }, i = 0) => {
      const $makeLabel = makeElement("label", Object.assign({}, Attr, { for: makeId(path) }));
      $makeDivforRadio.append($makeLabel.text($element));
      const $makeInputTag = makeElement("input", Object.assign({}, Attr, {
        value: $element,
        type: "radio",
        id: makeId(path) + "-" + i++
      }))
      $makeDivforRadio.append($makeInputTag);
    })
    $element.append($makeDiv);
  }

  //create error div
  const $makeErrorDiv = makeElement("div", Object.assign({}, meta.attr || {}, { class: "error", id: meta.attr.id || makeId(path) + "-err" }));
  $makeDiv.append($makeErrorDiv);
}


//map from type to type handling function.  
const FNS = {
  block,
  form,
  header,
  input,
  link,
  multiSelect,
  para,
  segment,
  submit,
  uniSelect,
};

/*************************** Top-Level Code ****************************/

function render(path, $element = $('body')) {
  const meta = access(path);
  if (!meta) {
    $element.append(`<p>Path ${makeId(path)} not found</p>`);
  }
  else {
    const type = getType(meta);
    const fn = FNS[type];
    if (fn) {
      fn(meta, path, $element);
    }
    else {
      $element.append(`<p>type ${type} not supported</p>`);
    }
  }
}

function go() {
  const ref = getRef() || DEFAULT_REF;
  render([ref]);
}

go();