webpackJsonp([0],[
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.



var punycode = __webpack_require__(12);
var util = __webpack_require__(14);

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // Special case for a simple path URL
    simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = __webpack_require__(15);

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && util.isObject(url) && url instanceof Url) return url;

  var u = new Url;
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
  if (!util.isString(url)) {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  // Copy chrome, IE, opera backslash-handling behavior.
  // Back slashes before the query string get converted to forward slashes
  // See: https://code.google.com/p/chromium/issues/detail?id=25916
  var queryIndex = url.indexOf('?'),
      splitter =
          (queryIndex !== -1 && queryIndex < url.indexOf('#')) ? '?' : '#',
      uSplit = url.split(splitter),
      slashRegex = /\\/g;
  uSplit[0] = uSplit[0].replace(slashRegex, '/');
  url = uSplit.join(splitter);

  var rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  if (!slashesDenoteHost && url.split('#').length === 1) {
    // Try fast path regexp
    var simplePath = simplePathPattern.exec(rest);
    if (simplePath) {
      this.path = rest;
      this.href = rest;
      this.pathname = simplePath[1];
      if (simplePath[2]) {
        this.search = simplePath[2];
        if (parseQueryString) {
          this.query = querystring.parse(this.search.substr(1));
        } else {
          this.query = this.search.substr(1);
        }
      } else if (parseQueryString) {
        this.search = '';
        this.query = {};
      }
      return this;
    }
  }

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1)
      hostEnd = rest.length;

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      // IDNA Support: Returns a punycoded representation of "domain".
      // It only converts parts of the domain name that
      // have non-ASCII characters, i.e. it doesn't matter if
      // you call it with a domain that already is ASCII-only.
      this.hostname = punycode.toASCII(this.hostname);
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      if (rest.indexOf(ae) === -1)
        continue;
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) this.pathname = rest;
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  //to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (util.isString(obj)) obj = urlParse(obj);
  if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

Url.prototype.format = function() {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
      pathname = this.pathname || '',
      hash = this.hash || '',
      host = false,
      query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ?
        this.hostname :
        '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query &&
      util.isObject(this.query) &&
      Object.keys(this.query).length) {
    query = querystring.stringify(this.query);
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  pathname = pathname.replace(/[?#]/g, function(match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function(relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function(relative) {
  if (util.isString(relative)) {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  var tkeys = Object.keys(this);
  for (var tk = 0; tk < tkeys.length; tk++) {
    var tkey = tkeys[tk];
    result[tkey] = this[tkey];
  }

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    var rkeys = Object.keys(relative);
    for (var rk = 0; rk < rkeys.length; rk++) {
      var rkey = rkeys[rk];
      if (rkey !== 'protocol')
        result[rkey] = relative[rkey];
    }

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      var keys = Object.keys(relative);
      for (var v = 0; v < keys.length; v++) {
        var k = keys[v];
        result[k] = relative[k];
      }
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
      else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = (relative.host || relative.host === '') ?
                  relative.host : result.host;
    result.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (!util.isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especially happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (!util.isNull(result.pathname) || !util.isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (result.host || relative.host || srcPath.length > 1) &&
      (last === '.' || last === '..') || last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last === '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = result.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especially happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = result.host && result.host.indexOf('@') > 0 ?
                     result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (!util.isNull(result.pathname) || !util.isNull(result.search)) {
    result.path = (result.pathname ? result.pathname : '') +
                  (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function() {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};


/***/ }),
/* 1 */,
/* 2 */,
/* 3 */,
/* 4 */,
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

__webpack_require__(6);
module.exports = __webpack_require__(39);


/***/ }),
/* 6 */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
Object.defineProperty(__webpack_exports__, "__esModule", { value: true });
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_0_popper_js__ = __webpack_require__(3);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_1_aos__ = __webpack_require__(4);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_1_aos___default = __webpack_require__.n(__WEBPACK_IMPORTED_MODULE_1_aos__);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_2_shariff__ = __webpack_require__(7);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_2_shariff___default = __webpack_require__.n(__WEBPACK_IMPORTED_MODULE_2_shariff__);
window.$ = window.jQuery = __webpack_require__(2);




$(document).ready(function () {

  __WEBPACK_IMPORTED_MODULE_1_aos___default.a.init({
    once: true
  });

  // FB Shariff
  var buttonsContainer = $('.some-selector');
  new __WEBPACK_IMPORTED_MODULE_2_shariff___default.a(buttonsContainer, {
    orientation: 'vertical'
  });
});

/***/ }),
/* 7 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/* WEBPACK VAR INJECTION */(function(global) {

// require('babel-polyfill')

const $ = __webpack_require__(8)
const services = __webpack_require__(9)
const url = __webpack_require__(0)

// Defaults may be overridden either by passing "options" to Shariff constructor
// or by setting data attributes.
const Defaults = {
  theme: 'color',

  // URL to backend that requests social counts. null means "disabled"
  backendUrl: null,

  // Link to the "about" page
  infoUrl: 'http://ct.de/-2467514',

  // Type of display for the "about" page: "blank", "popup" or "self", default = "blank"
  infoDisplay: 'blank',

  // localisation: "de" or "en"
  lang: 'de',

  // fallback language for not fully localized services
  langFallback: 'en',

  mailUrl: function() {
    var shareUrl = url.parse(this.getURL(), true)
    shareUrl.query.view = 'mail'
    delete shareUrl.search
    return url.format(shareUrl)
  },

  mailBody: function() { return this.getURL() },

  // Media (e.g. image) URL to be shared
  mediaUrl: null,

  // horizontal/vertical
  orientation: 'horizontal',

  // icon/icon-count/standard
  buttonStyle: 'standard',

  // a string to suffix current URL
  referrerTrack: null,

  // services to be enabled in the following order
  services: ['twitter', 'facebook', 'googleplus', 'info'],

  title: global.document.title,

  twitterVia: null,

  flattrUser: null,

  flattrCategory: null,

  // build URI from rel="canonical" or document.location
  url: function() {
    var url = global.document.location.href
    var canonical = $('link[rel=canonical]').attr('href') || this.getMeta('og:url') || ''

    if (canonical.length > 0) {
      if (canonical.indexOf('http') < 0) {
        canonical = global.document.location.protocol + '//' + global.document.location.host + canonical
      }
      url = canonical
    }

    return url
  }
}

class Shariff {
  constructor(element, options) {
    // the DOM element that will contain the buttons
    this.element = element

    // Ensure elemnt is empty
    $(element).empty()

    this.options = $.extend({}, Defaults, options, $(element).data())

    // filter available services to those that are enabled and initialize them
    this.services = Object.keys(services)
      .filter(service => this.isEnabledService(service))
      .sort((a, b) => {
        let services = this.options.services
        return services.indexOf(a) - services.indexOf(b)
      })
      .map(serviceName => services[serviceName](this))

    this._addButtonList()

    if (this.options.backendUrl !== null && this.options.buttonStyle !== 'icon') {
      this.getShares(this._updateCounts.bind(this))
    }
  }

  isEnabledService(serviceName) {
    return this.options.services.indexOf(serviceName) > -1
  }

  $socialshareElement() {
    return $(this.element)
  }

  getLocalized(data, key) {
    if (typeof data[key] === 'object') {
      if (typeof data[key][this.options.lang] === 'undefined') {
        return data[key][this.options.langFallback]
      } else {
        return data[key][this.options.lang]
      }
    } else if (typeof data[key] === 'string') {
      return data[key]
    }
    return undefined
  }

  // returns content of <meta name="" content=""> tags or '' if empty/non existant
  getMeta(name) {
    var metaContent = $(`meta[name="${name}"],[property="${name}"]`).attr('content')
    return metaContent || ''
  }

  getInfoUrl() {
    return this.options.infoUrl
  }

  getInfoDisplayPopup() {
    return (this.options.infoDisplay === 'popup')
  }

  getInfoDisplayBlank() {
    return (
      (this.options.infoDisplay !== 'popup') &&
      (this.options.infoDisplay !== 'self')
    )
  }

  getURL() {
    return this.getOption('url')
  }

  getOption(name) {
    var option = this.options[name]
    return (typeof option === 'function') ? option.call(this) : option
  }

  getTitle() {
    let title = this.getOption('title') || this.getMeta('DC.title')
    let creator = this.getMeta('DC.creator')
    if (title && creator) title = `${title} - ${creator}`
    return title
  }

  getReferrerTrack() {
    return this.options.referrerTrack || ''
  }

  // returns shareCounts of document
  getShares(callback) {
    var baseUrl = url.parse(this.options.backendUrl, true)
    baseUrl.query.url = this.getURL()
    delete baseUrl.search
    return $.getJSON(url.format(baseUrl), callback)
  }

  // add value of shares for each service
  _updateCounts(data, status, xhr) {
    if (!data) return
    $.each(data, (serviceName, value) => {
      if (!this.isEnabledService(serviceName)) {
        return
      }
      if (value >= 1000) {
        value = Math.round(value / 1000) + 'k'
      }
      $(this.element)
        .find(`.${serviceName} a`)
        .append($('<span/>').addClass('share_count').text(value))
    })
  }

  // add html for button-container
  _addButtonList() {
    var $buttonList = $('<ul/>').addClass([
      'theme-' + this.options.theme,
      'orientation-' + this.options.orientation,
      'button-style-' + this.options.buttonStyle,
      'shariff-col-' + this.options.services.length
    ].join(' '))

    // add html for service-links
    this.services.forEach(service => {
      var $li = $('<li/>').addClass(`shariff-button ${service.name}`)
      var $shareLink = $('<a/>').attr('href', service.shareUrl)

      if (this.options.buttonStyle === 'standard') {
        var $shareText = $('<span/>')
          .addClass('share_text')
          .text(this.getLocalized(service, 'shareText'))
        $shareLink.append($shareText)
      }

      if (typeof service.faPrefix !== 'undefined' && typeof service.faName !== 'undefined') {
        $shareLink.prepend($('<span/>').addClass(`${service.faPrefix} ${service.faName}`))
      }

      if (service.popup) {
        $shareLink.attr('data-rel', 'popup')
        if (service.name !== 'info') {
          $shareLink.attr('rel', 'nofollow')
        }
      } else if (service.blank) {
        $shareLink.attr('target', '_blank')
        if (service.name === 'info') {
          $shareLink.attr('rel', 'noopener noreferrer')
        } else {
          $shareLink.attr('rel', 'nofollow noopener noreferrer')
        }
      } else if (service.name !== 'info') {
        $shareLink.attr('rel', 'nofollow')
      }
      $shareLink.attr('title', this.getLocalized(service, 'title'))

      // add attributes for screen readers
      $shareLink.attr('role', 'button')
      $shareLink.attr('aria-label', this.getLocalized(service, 'title'))

      $li.append($shareLink)

      $buttonList.append($li)
    })

    // event delegation
    $buttonList.on('click', '[data-rel="popup"]', function(e) {
      e.preventDefault()

      var url = $(this).attr('href')

      // if a twitter widget is embedded on current site twitter's widget.js
      // will open a popup so we should not open a second one.
      if (url.match(/twitter\.com\/intent\/(\w+)/)) {
        var w = global.window
        if (w.__twttr && w.__twttr.widgets && w.__twttr.widgets.loaded) {
          return
        }
      }

      global.window.open(url, '_blank', 'width=600,height=460')
    })

    this.$socialshareElement().append($buttonList)
  }
}

module.exports = Shariff

// export Shariff class to global (for non-Node users)
global.Shariff = Shariff

$(function() {
  // initialize .shariff elements
  $('.shariff').each(function() {
    if (!this.hasOwnProperty('shariff')) {
      this.shariff = new Shariff(this)
    }
  })
})

/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(1)))

/***/ }),
/* 8 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


// https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Object/assign#Polyfill
if (typeof Object.assign !== 'function') {
  // jshint maxdepth:4
  Object.assign = function(target, varArgs) { // .length of function is 2
    if (target === null) { // TypeError if undefined or null
      throw new TypeError('Cannot convert undefined or null to object')
    }

    var to = Object(target)

    for (var index = 1; index < arguments.length; index++) {
      var nextSource = arguments[index]

      if (nextSource !== null) { // Skip over if undefined or null
        for (var nextKey in nextSource) {
          // Avoid bugs when hasOwnProperty is shadowed
          if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
            to[nextKey] = nextSource[nextKey]
          }
        }
      }
    }
    return to
  }
}

/**
 * Initialization helper. This method is this module's exported entry point.
 * @param {string|Array|Element} selector - css selector, one element, array of nodes or html fragment
 * @param {node} [context=document] - context node in which to query
 * @returns {DOMQuery} A DOMQuery instance containing the selected set of nodes
 */
function dq(selector, context) {
  var nodes = []
  context = context || document
  if (typeof selector === 'function') {
    if (context.attachEvent ? context.readyState === 'complete' : context.readyState !== 'loading') {
      selector()
    } else {
      context.addEventListener('DOMContentLoaded', selector)
    }
  } else if (selector instanceof Element) {
    nodes = [ selector ]
  } else if (typeof selector === 'string') {
    if (selector[0] === '<') {
      nodes = Array.prototype.slice.call(fragment(selector))
    } else {
      nodes = Array.prototype.slice.call(context.querySelectorAll(selector))
    }
  } else {
    nodes = selector
  }
  return new DOMQuery(nodes, context)
}

/**
 * Contains a set of DOM nodes and provides methods to manipulate the nodes.
 * @constructor
 */
function DOMQuery(elements, context) {
  this.length = elements.length
  this.context = context
  var self = this
  each(elements, function(i) { self[i] = this })
}

/**
 * Iterates through each node and calls the callback in its context.
 * @param {eachArrayCallback} callback - A function to be called with a node
 * @returns {DOMQuery}
 */
DOMQuery.prototype.each = function(callback) {
  for (var i = this.length - 1; i >= 0; i--) {
    callback.call(this[i], i, this[i])
  }
  return this
}

/**
 * Empties each node.
 * @returns {DOMQuery}
 */
DOMQuery.prototype.empty = function() {
  return this.each(empty)
}

/**
 * Sets the text content of each node. Returns the text content of the first node.
 * @param {string} [text] - The text content to set
 * @returns {DOMQuery|string}
 */
DOMQuery.prototype.text = function(text) {
  if (text === undefined) {
    return this[0].textContent
  }
  return this.each(function () { this.textContent = text })
}

/**
 * Sets an attribute on each node. Returns the attribute's value of the first node.
 * @param {string} [name] - The attribute's name
 * @param {string} [value] - The value to set
 * @returns {DOMQuery|string}
 */
DOMQuery.prototype.attr = function (name, value) {
  if (this.length < 1) {
    return null
  }
  if (value === undefined) {
    return this[0].getAttribute(name)
  }
  return this.each(function() { this.setAttribute(name, value) })
}

/**
 * Sets a data attribute on each node. Returns the data attribute's value of the first node.
 * Supports deserialization of complex data types as values.
 * @param {string} [key] - The attribute's name
 * @param {string} [value] - The value to set
 * @returns {DOMQuery|string|Object}
 */
DOMQuery.prototype.data = function(key, value) {
  if (value) {
    return this.attr('data-' + key, value)
  }
  if (key) {
    return this.attr('data-' + key)
  }
  var data = Object.assign({}, this[0].dataset)
  each(data, function(k, v) { data[k] = deserializeValue(v) })
  return data
}

/**
 * Returns a new DOMQuery instance containing all matched nodes in the context
 * of the set of nodes.
 * @param {string} selector - The CSS selector
 * @returns {DOMQuery}
 */
DOMQuery.prototype.find = function(selector) {
  var matches
  // querySelectorAll in the context of each element in the set
  matches = map(this, function(el) { return el.querySelectorAll(selector) })
  // convert NodeList matches into Array
  matches = map(matches, function(el) { return Array.prototype.slice.call(el) })
  // flatten the array
  matches = Array.prototype.concat.apply([], matches)
  return new DOMQuery(matches)
}

/**
 * Appends nodes to the end of the first node in the set.
 * @param {string|Array} html - Nodes to append. May be a string containing HTML.
 * @returns {DOMQuery}
 */
DOMQuery.prototype.append = function(html) {
  if (typeof html === 'string') {
    html = fragment(html)
  }
  append(this[0], html)
  return this
}

/**
 * Prepends nodes at the top of the first node in the set.
 * @param {string|Array} html - Nodes to append. May be a string containing HTML.
 * @returns {DOMQuery}
 */
DOMQuery.prototype.prepend = function(html) {
  if (typeof html === 'string') {
    html = fragment(html)
  }
  prepend(this[0], html)
  return this
}

/**
 * Adds a CSS class name to the nodes in the set.
 * @param {string} name - Class name to add
 * @returns {DOMQuery}
 */
DOMQuery.prototype.addClass = function(names) {
  return this.each(function() {
    // Workaround: IE only supports a single parameter to classList.add()
    names.split(' ').forEach(className => {
      this.classList.add(className)
    })
  })
}

/**
 * Removes a CSS class name from the nodes in the set.
 * @param {string} name - Class name to remove
 * @returns {DOMQuery}
 */
DOMQuery.prototype.removeClass = function(name) {
  return this.each(function() { this.classList.remove(name) })
}

/**
 * Delegates an event for a node matching a selector to each element in the set.
 * @param {string} event - The event name
 * @param {string} selector - The CSS selector
 * @param {eventHandler} handler - The event handler function
 * @returns {DOMQuery}
 */
DOMQuery.prototype.on = function(event, selector, handler) {
  return this.each(function() {
    delegateEvent(selector, event, handler, this)
  })
}

/**
 * Removes each child of a node.
 * @private
 */
var empty = function () {
  while (this.hasChildNodes()) {
    this.removeChild(this.firstChild)
  }
}

/**
 * Callback function used for map(array, callback).
 *
 * @callback mapCallback
 * @param {Object} object - An element of the array
 * @return {Array}
 * @see map
 */

/**
 * Runs a callback with each element in an array and returns a new array.
 * @param {Array} objects - The array to iterate
 * @param {function} callback - The callback function
 * @returns {Array}
 */
var map = function (objects, callback) {
  return Array.prototype.map.call(objects, callback)
}

/**
 * Callback function used for each(array, callback).
 * Called in the context of each element in the array.
 *
 * @callback eachArrayCallback
 * @param {number} index - Index of the current array element
 * @param {object} value - Element of the array
 * @return {Array}
 * @see each
 */

/**
 * Callback function used for each(object, callback).
 * Called in the context of each object property value.
 *
 * @callback eachObjectCallback
 * @param {Object} key - The object's property key
 * @param {object} value - The object's property value
 * @return {Array}
 * @see each
 */

/**
 * Runs a callback with each element in an array or key-value pair of an object.
 * Returns the original object/array.
 * @param {Object} object - The object to itrate
 * @param {eachArrayCallback|eachObjectCallback} callback - The callback function
 * @returns {Array}
 */
var each = function (object, callback) {
  if (object instanceof Array) {
    for (var i = 0; i < object.length; i++) {
      callback.call(object[i], i, object[i])
    }
  } else if (object instanceof Object) {
    for (var prop in object) {
      callback.call(object[prop], prop, object[prop], object)
    }
  }
  return object
}

/**
 * Constructs HTML nodes from a string of HTML.
 * @param {string} html - String of HTML code
 * @returns {Array}
 * @private
 */
var fragment = function (html) {
  var div = document.createElement('div')
  div.innerHTML = html
  return div.children
}

/**
 * Appends an array of nodes to the end of an HTML element.
 * @param {Element} parent - Element to append to
 * @param {Array} nodes - Collection of nodes to append
 * @private
 */
var append = function (parent, nodes) {
  for (var i = 0; i < nodes.length; i++) {
    parent.appendChild(nodes[i])
  }
}

/**
 * Prepends an array of nodes to the top of an HTML element.
 * @param {Element} parent - Element to prepend to
 * @param {Array} nodes - Collection of nodes to prepend
 * @private
 */
var prepend = function (parent, nodes) {
  for (var i = nodes.length - 1; i >= 0; i--) {
    parent.insertBefore(nodes[nodes.length - 1], parent.firstChild)
  }
}

/**
 * Returns the closest parent of a node matching a CSS selector.
 * @param {HTMLElement} element - Element to append to
 * @param {string} selector - CSS selector
 * @param {HTMLElement}
 * @private
 * @see {@link https://gist.github.com/Daniel-Hug/abbded91dd55466e590b}
 */
var closest = (function() {
  var element = HTMLElement.prototype
  var matches = element.matches ||
    element.webkitMatchesSelector ||
    element.mozMatchesSelector ||
    element.msMatchesSelector

  return function closest(element, selector) {
    if (element === null) return
    return matches.call(element, selector)
      ? element
      : closest(element.parentElement, selector)
  }
})()

/**
 * An event handler.
 *
 * @callback eventHandler
 * @param {Event} event - The event this handler was triggered for
 */

/**
 * Delegates an event for a node matching a selector.
 * @param {string} selector - The CSS selector
 * @param {string} event - The event name
 * @param {eventHandler} handler - The event handler function
 * @param {HTMLElement} [scope=document] - Element to add the event listener to
 * @private
 */
var delegateEvent = function (selector, event, handler, scope) {
  (scope || document).addEventListener(event, function(event) {
    var listeningTarget = closest(event.target, selector)
    if (listeningTarget) {
      handler.call(listeningTarget, event)
    }
  })
}

/**
 * Extends properties of all arguments into a single object.
 * @param {...Object} objects - Objects to merge
 * @param {string} event - The event name
 * @param {function} handler - The event handler function
 * @returns {Object}
 * @see {@link https://gomakethings.com/vanilla-javascript-version-of-jquery-extend/}
 */
var extend = function (objects) {
  // Variables
  var extended = {}
  var deep = false
  var i = 0
  var length = arguments.length

  // Check if a deep merge
  if (Object.prototype.toString.call(arguments[0]) === '[object Boolean]') {
    deep = arguments[0]
    i++
  }

  // Merge the object into the extended object
  var merge = function (obj) {
    for (var prop in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, prop)) {
        // If deep merge and property is an object, merge properties
        if (deep && Object.prototype.toString.call(obj[prop]) === '[object Object]') {
          extended[prop] = extend(true, extended[prop], obj[prop])
        } else {
          extended[prop] = obj[prop]
        }
      }
    }
  }

  // Loop through each object and conduct a merge
  for (; i < length; i++) {
    var obj = arguments[i]
    merge(obj)
  }

  return extended
}

/**
 * The callback function for getJSON().
 *
 * @callback xhrCallback
 * @param {boolean} success - True on success. False on error.
 * @param {Object} data - The parsed data. null if success == false
 * @param {XMLHttpRequest} xhr - The request object
 * @see getJSON
 */

/**
 * Runs an Ajax request against a url and calls the callback function with
 * the parsed JSON result.
 * @param {string} url - The url to request
 * @param {xhrCallback} callback - The callback function
 * @returns {XMLHttpRequest}
 */
var getJSON = function (url, callback) {
  var xhr = new XMLHttpRequest()
  xhr.open('GET', url, true)
  xhr.setRequestHeader('Content-Type', 'application/json')
  xhr.setRequestHeader('Accept', 'application/json')

  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 400) {
      var data = JSON.parse(xhr.responseText)
      callback(data, xhr.status, xhr)
    } else {
      callback(null, xhr.status, xhr)
    }
  }

  xhr.onerror = function(e) {
    callback(new Error(e), null, xhr)
  }

  xhr.send()
}

/**
 * Deserializes JSON values from strings. Used with data attributes.
 * @param {string} value - String to parse
 * @returns {Object}
 * @private
 */
var deserializeValue = function (value) {
  /* jshint maxcomplexity:7 */
  // boolean
  if (value === 'true') { return true }
  if (value === 'false') { return false }
  // null
  if (value === 'null') { return null }
  // number
  if (+value + '' === value) { return +value }
  // json
  if (/^[[{]/.test(value)) {
    try {
      return JSON.parse(value)
    } catch (e) {
      return value
    }
  }
  // everything else
  return value
}

dq.extend = extend
dq.map = map
dq.each = each
dq.getJSON = getJSON

module.exports = dq


/***/ }),
/* 9 */
/***/ (function(module, exports, __webpack_require__) {

module.exports = {
  addthis: __webpack_require__(10),
  diaspora: __webpack_require__(11),
  facebook: __webpack_require__(18),
  flattr: __webpack_require__(19),
  flipboard: __webpack_require__(20),
  googleplus: __webpack_require__(21),
  info: __webpack_require__(22),
  linkedin: __webpack_require__(23),
  mail: __webpack_require__(24),
  pinterest: __webpack_require__(25),
  print: __webpack_require__(26),
  qzone: __webpack_require__(27),
  reddit: __webpack_require__(28),
  stumbleupon: __webpack_require__(29),
  telegram: __webpack_require__(30),
  tencent: __webpack_require__(31),
  threema: __webpack_require__(32),
  tumblr: __webpack_require__(33),
  twitter: __webpack_require__(34),
  vk: __webpack_require__(35),
  weibo: __webpack_require__(36),
  whatsapp: __webpack_require__(37),
  xing: __webpack_require__(38)
}


/***/ }),
/* 10 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function(shariff) {
  var url = encodeURIComponent(shariff.getURL())
  return {
    popup: true,
    shareText: {
      'bg': 'cподеляне',
      'cs': 'sdílet',
      'da': 'del',
      'de': 'teilen',
      'en': 'share',
      'es': 'compartir',
      'fi': 'Jaa',
      'fr': 'partager',
      'hr': 'podijelite',
      'hu': 'megosztás',
      'it': 'condividi',
      'ja': '共有',
      'ko': '공유하기',
      'nl': 'delen',
      'no': 'del',
      'pl': 'udostępnij',
      'pt': 'compartilhar',
      'ro': 'partajează',
      'ru': 'поделиться',
      'sk': 'zdieľať',
      'sl': 'deli',
      'sr': 'podeli',
      'sv': 'dela',
      'tr': 'paylaş',
      'zh': '分享'
    },
    name: 'addthis',
    faPrefix: 'fas',
    faName: 'fa-plus',
    title: {
      'bg': 'Сподели в AddThis',
      'cs': 'Sdílet na AddThis',
      'da': 'Del på AddThis',
      'de': 'Bei AddThis teilen',
      'en': 'Share on AddThis',
      'es': 'Compartir en AddThis',
      'fi': 'Jaa AddThisissä',
      'fr': 'Partager sur AddThis',
      'hr': 'Podijelite na AddThis',
      'hu': 'Megosztás AddThisen',
      'it': 'Condividi su AddThis',
      'ja': 'AddThis上で共有',
      'ko': 'AddThis에서 공유하기',
      'nl': 'Delen op AddThis',
      'no': 'Del på AddThis',
      'pl': 'Udostępnij przez AddThis',
      'pt': 'Compartilhar no AddThis',
      'ro': 'Partajează pe AddThis',
      'ru': 'Поделиться на AddThis',
      'sk': 'Zdieľať na AddThis',
      'sl': 'Deli na AddThis',
      'sr': 'Podeli na AddThis',
      'sv': 'Dela på AddThis',
      'tr': 'AddThis\'ta paylaş',
      'zh': '在AddThis上分享'
    },
    shareUrl: 'http://api.addthis.com/oexchange/0.8/offer?url=' + url + shariff.getReferrerTrack()
  }
}


/***/ }),
/* 11 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var url = __webpack_require__(0)

module.exports = function(shariff) {
  var shareUrl = url.parse('https://share.diasporafoundation.org/', true)
  shareUrl.query.url = shariff.getURL()
  shareUrl.query.title = shariff.getTitle()
  shareUrl.protocol = 'https'
  delete shareUrl.search

  return {
    popup: true,
    shareText: {
      'bg': 'cподеляне',
      'cs': 'sdílet',
      'da': 'del',
      'de': 'teilen',
      'en': 'share',
      'es': 'compartir',
      'fi': 'Jaa',
      'fr': 'partager',
      'hr': 'podijelite',
      'hu': 'megosztás',
      'it': 'condividi',
      'ja': '共有',
      'ko': '공유하기',
      'nl': 'delen',
      'no': 'del',
      'pl': 'udostępnij',
      'pt': 'compartilhar',
      'ro': 'partajează',
      'ru': 'поделиться',
      'sk': 'zdieľať',
      'sl': 'deli',
      'sr': 'podeli',
      'sv': 'dela',
      'tr': 'paylaş',
      'zh': '分享'
    },
    name: 'diaspora',
    faPrefix: 'fas',
    faName: 'fa-asterisk',
    title: {
      'bg': 'Сподели в Diaspora',
      'cs': 'Sdílet na Diaspora',
      'da': 'Del på Diaspora',
      'de': 'Bei Diaspora teilen',
      'en': 'Share on Diaspora',
      'es': 'Compartir en Diaspora',
      'fi': 'Jaa Diasporaissä',
      'fr': 'Partager sur Diaspora',
      'hr': 'Podijelite na Diaspora',
      'hu': 'Megosztás Diaspora',
      'it': 'Condividi su Diaspora',
      'ja': 'Diaspora上で共有',
      'ko': 'Diaspora에서 공유하기',
      'nl': 'Delen op Diaspora',
      'no': 'Del på Diaspora',
      'pl': 'Udostępnij przez Diaspora',
      'pt': 'Compartilhar no Diaspora',
      'ro': 'Partajează pe Diaspora',
      'ru': 'Поделиться на Diaspora',
      'sk': 'Zdieľať na Diaspora',
      'sl': 'Deli na Diaspora',
      'sr': 'Podeli na Diaspora-u',
      'sv': 'Dela på Diaspora',
      'tr': 'Diaspora\'ta paylaş',
      'zh': '分享至Diaspora'
    },
    shareUrl: url.format(shareUrl) + shariff.getReferrerTrack()
  }
}


/***/ }),
/* 12 */
/***/ (function(module, exports, __webpack_require__) {

/* WEBPACK VAR INJECTION */(function(module, global) {var __WEBPACK_AMD_DEFINE_RESULT__;/*! https://mths.be/punycode v1.4.1 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports &&
		!exports.nodeType && exports;
	var freeModule = typeof module == 'object' && module &&
		!module.nodeType && module;
	var freeGlobal = typeof global == 'object' && global;
	if (
		freeGlobal.global === freeGlobal ||
		freeGlobal.window === freeGlobal ||
		freeGlobal.self === freeGlobal
	) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^\x20-\x7E]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw new RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		var result = [];
		while (length--) {
			result[length] = fn(array[length]);
		}
		return result;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings or email
	 * addresses.
	 * @private
	 * @param {String} domain The domain name or email address.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		var parts = string.split('@');
		var result = '';
		if (parts.length > 1) {
			// In email addresses, only the domain name should be punycoded. Leave
			// the local part (i.e. everything up to `@`) intact.
			result = parts[0] + '@';
			string = parts[1];
		}
		// Avoid `split(regex)` for IE8 compatibility. See #17.
		string = string.replace(regexSeparators, '\x2E');
		var labels = string.split('.');
		var encoded = map(labels, fn).join('.');
		return result + encoded;
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <https://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * https://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols (e.g. a domain name label) to a
	 * Punycode string of ASCII-only symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name or an email address
	 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
	 * it doesn't matter if you call it on a string that has already been
	 * converted to Unicode.
	 * @memberOf punycode
	 * @param {String} input The Punycoded domain name or email address to
	 * convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(input) {
		return mapDomain(input, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name or an email address to
	 * Punycode. Only the non-ASCII parts of the domain name will be converted,
	 * i.e. it doesn't matter if you call it with a domain that's already in
	 * ASCII.
	 * @memberOf punycode
	 * @param {String} input The domain name or email address to convert, as a
	 * Unicode string.
	 * @returns {String} The Punycode representation of the given domain name or
	 * email address.
	 */
	function toASCII(input) {
		return mapDomain(input, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.4.1',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <https://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		true
	) {
		!(__WEBPACK_AMD_DEFINE_RESULT__ = (function() {
			return punycode;
		}).call(exports, __webpack_require__, exports, module),
				__WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));
	} else if (freeExports && freeModule) {
		if (module.exports == freeExports) {
			// in Node.js, io.js, or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else {
			// in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else {
		// in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(13)(module), __webpack_require__(1)))

/***/ }),
/* 13 */
/***/ (function(module, exports) {

module.exports = function(module) {
	if(!module.webpackPolyfill) {
		module.deprecate = function() {};
		module.paths = [];
		// module.parent = undefined by default
		if(!module.children) module.children = [];
		Object.defineProperty(module, "loaded", {
			enumerable: true,
			get: function() {
				return module.l;
			}
		});
		Object.defineProperty(module, "id", {
			enumerable: true,
			get: function() {
				return module.i;
			}
		});
		module.webpackPolyfill = 1;
	}
	return module;
};


/***/ }),
/* 14 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = {
  isString: function(arg) {
    return typeof(arg) === 'string';
  },
  isObject: function(arg) {
    return typeof(arg) === 'object' && arg !== null;
  },
  isNull: function(arg) {
    return arg === null;
  },
  isNullOrUndefined: function(arg) {
    return arg == null;
  }
};


/***/ }),
/* 15 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


exports.decode = exports.parse = __webpack_require__(16);
exports.encode = exports.stringify = __webpack_require__(17);


/***/ }),
/* 16 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.



// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};


/***/ }),
/* 17 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.



var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return map(obj[k], function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};


/***/ }),
/* 18 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function(shariff) {
  var url = encodeURIComponent(shariff.getURL())
  return {
    popup: true,
    shareText: {
      'bg': 'cподеляне',
      'cs': 'sdílet',
      'da': 'del',
      'de': 'teilen',
      'en': 'share',
      'es': 'compartir',
      'fi': 'Jaa',
      'fr': 'partager',
      'hr': 'podijelite',
      'hu': 'megosztás',
      'it': 'condividi',
      'ja': '共有',
      'ko': '공유하기',
      'nl': 'delen',
      'no': 'del',
      'pl': 'udostępnij',
      'pt': 'compartilhar',
      'ro': 'partajează',
      'ru': 'поделиться',
      'sk': 'zdieľať',
      'sl': 'deli',
      'sr': 'podeli',
      'sv': 'dela',
      'tr': 'paylaş',
      'zh': '分享'
    },
    name: 'facebook',
    faPrefix: 'fab',
    faName: 'fa-facebook-f',
    title: {
      'bg': 'Сподели във Facebook',
      'cs': 'Sdílet na Facebooku',
      'da': 'Del på Facebook',
      'de': 'Bei Facebook teilen',
      'en': 'Share on Facebook',
      'es': 'Compartir en Facebook',
      'fi': 'Jaa Facebookissa',
      'fr': 'Partager sur Facebook',
      'hr': 'Podijelite na Facebooku',
      'hu': 'Megosztás Facebookon',
      'it': 'Condividi su Facebook',
      'ja': 'フェイスブック上で共有',
      'ko': '페이스북에서 공유하기',
      'nl': 'Delen op Facebook',
      'no': 'Del på Facebook',
      'pl': 'Udostępnij na Facebooku',
      'pt': 'Compartilhar no Facebook',
      'ro': 'Partajează pe Facebook',
      'ru': 'Поделиться на Facebook',
      'sk': 'Zdieľať na Facebooku',
      'sl': 'Deli na Facebooku',
      'sr': 'Podeli na Facebook-u',
      'sv': 'Dela på Facebook',
      'tr': 'Facebook\'ta paylaş',
      'zh': '在Facebook上分享',
    },
    shareUrl: 'https://www.facebook.com/sharer/sharer.php?u=' + url + shariff.getReferrerTrack()
  }
}


/***/ }),
/* 19 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function(shariff) {
  var url = encodeURIComponent(shariff.getURL())
  var title = shariff.getTitle()
  var description = shariff.getMeta('description')

  return {
    popup: true,
    shareText: 'Flattr',
    name: 'flattr',
    faPrefix: 'far',
    faName: 'fa-money-bill-alt',
    title: {
      'de': 'Artikel flattrn',
      'en': 'Flattr this'
    },
    shareUrl: 'https://flattr.com/submit/auto?title=' + encodeURIComponent(title) + '&description=' + encodeURIComponent(description) + '&category=' + encodeURIComponent(shariff.options.flattrCategory || 'text') + '&user_id=' + encodeURIComponent(shariff.options.flattrUser) + '&url=' + url + shariff.getReferrerTrack()
  }
}


/***/ }),
/* 20 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function(shariff) {
  var url = encodeURIComponent(shariff.getURL())
  var title = encodeURIComponent(shariff.getTitle())
  return {
    popup: true,
    shareText: 'flip it',
    name: 'flipboard',
    faPrefix: 'fab',
    faName: 'fa-flipboard',
    title: {
      'bg': 'Сподели в Flipboard',
      'cs': 'Sdílet na Flipboardu',
      'da': 'Del på Flipboard',
      'de': 'Bei Flipboard teilen',
      'en': 'Share on Flipboard',
      'es': 'Compartir en Flipboard',
      'fi': 'Jaa Flipboardissä',
      'fr': 'Partager sur Flipboard',
      'hr': 'Podijelite na Flipboardu',
      'hu': 'Megosztás Flipboardon',
      'it': 'Condividi su Flipboard',
      'ja': 'Flipboard上で共有',
      'ko': 'Flipboard에서 공유하기',
      'nl': 'Delen op Flipboard',
      'no': 'Del på Flipboard',
      'pl': 'Udostępnij na Flipboardu',
      'pt': 'Compartilhar no Flipboard',
      'ro': 'Partajează pe Flipboard',
      'ru': 'Поделиться на Flipboard',
      'sk': 'Zdieľať na Flipboardu',
      'sl': 'Deli na Flipboardu',
      'sr': 'Podeli na Flipboard-u',
      'sv': 'Dela på Flipboard',
      'tr': 'Flipboard\'ta paylaş',
      'zh': '在Flipboard上分享'
    },
    shareUrl: 'https://share.flipboard.com/bookmarklet/popout?v=2&title=' + title + '&url=' + url + shariff.getReferrerTrack()
  }
}


/***/ }),
/* 21 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function(shariff) {
  var url = encodeURIComponent(shariff.getURL())
  return {
    popup: true,
    shareText: {
      'bg': 'cподеляне',
      'cs': 'sdílet',
      'da': 'del',
      'de': 'teilen',
      'en': 'share',
      'es': 'compartir',
      'fi': 'Jaa',
      'fr': 'partager',
      'hr': 'podijelite',
      'hu': 'megosztás',
      'it': 'condividi',
      'ja': '共有',
      'ko': '공유하기',
      'nl': 'delen',
      'no': 'del',
      'pl': 'udostępnij',
      'pt': 'compartilhar',
      'ro': 'partajează',
      'ru': 'поделиться',
      'sk': 'zdieľať',
      'sl': 'deli',
      'sr': 'podeli',
      'sv': 'dela',
      'tr': 'paylaş',
      'zh': '分享'
    },
    name: 'googleplus',
    faPrefix: 'fab',
    faName: 'fa-google-plus-g',
    title: {
      'bg': 'Сподели в Google+',
      'cs': 'Sdílet na Google+',
      'da': 'Del på Google+',
      'de': 'Bei Google+ teilen',
      'en': 'Share on Google+',
      'es': 'Compartir en Google+',
      'fi': 'Jaa Google+:ssa',
      'fr': 'Partager sur Goolge+',
      'hr': 'Podijelite na Google+',
      'hu': 'Megosztás Google+on',
      'it': 'Condividi su Google+',
      'ja': 'Google+上で共有',
      'ko': 'Google+에서 공유하기',
      'nl': 'Delen op Google+',
      'no': 'Del på Google+',
      'pl': 'Udostępnij na Google+',
      'pt': 'Compartilhar no Google+',
      'ro': 'Partajează pe Google+',
      'ru': 'Поделиться на Google+',
      'sk': 'Zdieľať na Google+',
      'sl': 'Deli na Google+',
      'sr': 'Podeli na Google+',
      'sv': 'Dela på Google+',
      'tr': 'Google+\'da paylaş',
      'zh': '在Google+上分享'
    },
    shareUrl: 'https://plus.google.com/share?url=' + url + shariff.getReferrerTrack()
  }
}


/***/ }),
/* 22 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function(shariff) {
  return {
    blank: shariff.getInfoDisplayBlank(),
    popup: shariff.getInfoDisplayPopup(),
    shareText: 'Info',
    name: 'info',
    faPrefix: 'fas',
    faName: 'fa-info',
    title: {
      'bg': 'Повече информация',
      'cs': 'Více informací',
      'da': 'Flere oplysninger',
      'de': 'Weitere Informationen',
      'en': 'More information',
      'es': 'Más informaciones',
      'fi': 'Lisätietoja',
      'fr': 'Plus d\'informations',
      'hr': 'Više informacija',
      'hu': 'Több információ',
      'it': 'Maggiori informazioni',
      'ja': '詳しい情報',
      'ko': '추가 정보',
      'nl': 'Verdere informatie',
      'no': 'Mer informasjon',
      'pl': 'Więcej informacji',
      'pt': 'Mais informações',
      'ro': 'Mai multe informatii',
      'ru': 'Больше информации',
      'sk': 'Viac informácií',
      'sl': 'Več informacij',
      'sr': 'Više informacija',
      'sv': 'Mer information',
      'tr': 'Daha fazla bilgi',
      'zh': '更多信息'
    },
    shareUrl: shariff.getInfoUrl()
  }
}


/***/ }),
/* 23 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function(shariff) {
  var url = encodeURIComponent(shariff.getURL())
  var title = encodeURIComponent(shariff.getTitle())
  var descr = encodeURIComponent(shariff.getMeta('description'))
  return {
    popup: true,
    shareText: {
      'bg': 'cподеляне',
      'cs': 'sdílet',
      'da': 'del',
      'de': 'mitteilen',
      'en': 'share',
      'es': 'compartir',
      'fi': 'Jaa',
      'fr': 'partager',
      'hr': 'podijelite',
      'hu': 'megosztás',
      'it': 'condividi',
      'ja': 'シェア',
      'ko': '공유하기',
      'nl': 'delen',
      'no': 'del',
      'pl': 'udostępnij',
      'pt': 'compartilhar',
      'ro': 'distribuiți',
      'ru': 'поделиться',
      'sk': 'zdieľať',
      'sl': 'deli',
      'sr': 'podeli',
      'sv': 'dela',
      'tr': 'paylaş',
      'zh': '分享'
    },
    name: 'linkedin',
    faPrefix: 'fab',
    faName: 'fa-linkedin-in',
    title: {
      'bg': 'Сподели в LinkedIn',
      'cs': 'Sdílet na LinkedIn',
      'da': 'Del på LinkedIn',
      'de': 'Bei LinkedIn teilen',
      'en': 'Share on LinkedIn',
      'es': 'Compartir en LinkedIn',
      'fi': 'Jaa LinkedInissä',
      'fr': 'Partager sur LinkedIn',
      'hr': 'Podijelite na LinkedIn',
      'hu': 'Megosztás LinkedInen',
      'it': 'Condividi su LinkedIn',
      'ja': 'LinkedIn上で共有',
      'ko': 'LinkedIn에서 공유하기',
      'nl': 'Delen op LinkedIn',
      'no': 'Del på LinkedIn',
      'pl': 'Udostępnij przez LinkedIn',
      'pt': 'Compartilhar no LinkedIn',
      'ro': 'Partajează pe LinkedIn',
      'ru': 'Поделиться на LinkedIn',
      'sk': 'Zdieľať na LinkedIn',
      'sl': 'Deli na LinkedIn',
      'sr': 'Podeli na LinkedIn-u',
      'sv': 'Dela på LinkedIn',
      'tr': 'LinkedIn\'ta paylaş',
      'zh': '在LinkedIn上分享'
    },
    shareUrl: 'https://www.linkedin.com/shareArticle?mini=true&summary=' + descr + '&title=' + title + '&url=' + url
  }
}


/***/ }),
/* 24 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function(shariff) {
  var url = shariff.getOption('mailUrl')

  // mailto: link? Add body and subject.
  if (url.indexOf('mailto:') === 0) {
    url += '?subject=' + encodeURIComponent(shariff.getOption('mailSubject') || shariff.getTitle())
    url += '&body=' + encodeURIComponent(shariff.getOption('mailBody').replace(/\{url\}/i, shariff.getURL()))
  }

  return {
    blank: url.indexOf('http') === 0,
    popup: false,
    shareText: {
      'en': 'mail',
      'zh': '分享'
    },
    name: 'mail',
    faPrefix: 'fas',
    faName: 'fa-envelope',
    title: {
      'bg': 'Изпрати по имейл',
      'cs': 'Poslat mailem',
      'da': 'Sende via e-mail',
      'de': 'Per E-Mail versenden',
      'en': 'Send by email',
      'es': 'Enviar por email',
      'fi': 'Lähetä sähköpostitse',
      'fr': 'Envoyer par courriel',
      'hr': 'Pošaljite emailom',
      'hu': 'Elküldés e-mailben',
      'it': 'Inviare via email',
      'ja': '電子メールで送信',
      'ko': '이메일로 보내기',
      'nl': 'Sturen via e-mail',
      'no': 'Send via epost',
      'pl': 'Wyślij e-mailem',
      'pt': 'Enviar por e-mail',
      'ro': 'Trimite prin e-mail',
      'ru': 'Отправить по эл. почте',
      'sk': 'Poslať e-mailom',
      'sl': 'Pošlji po elektronski pošti',
      'sr': 'Pošalji putem email-a',
      'sv': 'Skicka via e-post',
      'tr': 'E-posta ile gönder',
      'zh': '通过电子邮件传送'
    },
    shareUrl: url
  }
}


/***/ }),
/* 25 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var url = __webpack_require__(0)

module.exports = function(shariff) {
  var title = shariff.getTitle()
  var creator = shariff.getMeta('DC.creator')
  if (creator.length > 0) {
    title += ' - ' + creator
  }
  var img = shariff.getOption('mediaUrl')
  if (!img || img.length <= 0) {
    img = shariff.getMeta('og:image')
  }

  var shareUrl = url.parse('https://www.pinterest.com/pin/create/link/', true)
  shareUrl.query.url = shariff.getURL()
  shareUrl.query.media = img
  shareUrl.query.description = title
  delete shareUrl.search

  return {
    popup: true,
    shareText: 'pin it',
    name: 'pinterest',
    faPrefix: 'fab',
    faName: 'fa-pinterest-p',
    title: {
      'bg': 'Сподели в Pinterest',
      'cs': 'Přidat na Pinterest',
      'da': 'Del på Pinterest',
      'de': 'Bei Pinterest pinnen',
      'en': 'Pin it on Pinterest',
      'es': 'Compartir en Pinterest',
      'fi': 'Jaa Pinterestissä',
      'fr': 'Partager sur Pinterest',
      'hr': 'Podijelite na Pinterest',
      'hu': 'Megosztás Pinteresten',
      'it': 'Condividi su Pinterest',
      'ja': 'Pinterest上で共有',
      'ko': 'Pinterest에서 공유하기',
      'nl': 'Delen op Pinterest',
      'no': 'Del på Pinterest',
      'pl': 'Udostępnij przez Pinterest',
      'pt': 'Compartilhar no Pinterest',
      'ro': 'Partajează pe Pinterest',
      'ru': 'Поделиться на Pinterest',
      'sk': 'Zdieľať na Pinterest',
      'sl': 'Deli na Pinterest',
      'sr': 'Podeli na Pinterest-u',
      'sv': 'Dela på Pinterest',
      'tr': 'Pinterest\'ta paylaş',
      'zh': '分享至Pinterest'
    },
    shareUrl: url.format(shareUrl) + shariff.getReferrerTrack()
  }
}


/***/ }),
/* 26 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/* jshint scripturl:true */


module.exports = function(shariff) {
  var url = 'javascript:window.print();'

  return {
    name: 'print',
    faPrefix: 'fas',
    faName: 'fa-print',
    popup: false,
    shareText: {
      'bg': '',
      'cs': 'tlačit',
      'da': '',
      'de': 'drucken',
      'en': 'print',
      'es': '',
      'fi': '',
      'fr': '',
      'hr': '',
      'hu': '',
      'it': '',
      'ja': '',
      'ko': '',
      'nl': '',
      'no': '',
      'pl': '',
      'pt': '',
      'ro': '',
      'ru': '',
      'sk': '',
      'sl': '',
      'sr': '',
      'sv': '',
      'tr': '',
      'zh': ''
    },
    title: {
      'bg': '',
      'cs': 'tlačit',
      'da': '',
      'de': 'drucken',
      'en': 'print',
      'es': '',
      'fi': '',
      'fr': '',
      'hr': '',
      'hu': '',
      'it': '',
      'ja': '',
      'ko': '',
      'nl': '',
      'no': '',
      'pl': '',
      'pt': '',
      'ro': '',
      'ru': '',
      'sk': '',
      'sl': '',
      'sr': '',
      'sv': '',
      'tr': '',
      'zh': ''
    },
    shareUrl: url
  }
}


/***/ }),
/* 27 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function(shariff) {
  var url = encodeURIComponent(shariff.getURL())

  var title = shariff.getTitle()

  return {
    popup: true,
    shareText: {
      'bg': 'cподеляне',
      'cs': 'sdílet',
      'da': 'del',
      'de': 'teilen',
      'en': 'share',
      'es': 'compartir',
      'fi': 'Jaa',
      'fr': 'partager',
      'hr': 'podijelite',
      'hu': 'megosztás',
      'it': 'condividi',
      'ja': '共有',
      'ko': '공유하기',
      'nl': 'delen',
      'no': 'del',
      'pl': 'udostępnij',
      'pt': 'compartilhar',
      'ro': 'partajează',
      'ru': 'поделиться',
      'sk': 'zdieľať',
      'sl': 'deli',
      'sr': 'podeli',
      'sv': 'dela',
      'tr': 'paylaş',
      'zh': '分享'
    },
    name: 'qzone',
    faPrefix: 'fab',
    faName: 'fa-qq',
    title: {
      'bg': 'Сподели в Qzone',
      'cs': 'Sdílet na Qzone',
      'da': 'Del på Qzone',
      'de': 'Bei Qzone teilen',
      'en': 'Share on Qzone',
      'es': 'Compartir en Qzone',
      'fi': 'Jaa Qzoneissä',
      'fr': 'Partager sur Qzone',
      'hr': 'Podijelite na Qzone',
      'hu': 'Megosztás Qzone',
      'it': 'Condividi su Qzone',
      'ja': 'Qzone上で共有',
      'ko': 'Qzone에서 공유하기',
      'nl': 'Delen op Qzone',
      'no': 'Del på Qzone',
      'pl': 'Udostępnij przez Qzone',
      'pt': 'Compartilhar no Qzone',
      'ro': 'Partajează pe Qzone',
      'ru': 'Поделиться на Qzone',
      'sk': 'Zdieľať na Qzone',
      'sl': 'Deli na Qzone',
      'sr': 'Podeli na Qzone-u',
      'sv': 'Dela på Qzone',
      'tr': 'Qzone\'ta paylaş',
      'zh': '分享至QQ空间'
    },
    shareUrl: 'http://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?url=' + url + '&title=' + title + shariff.getReferrerTrack()
  }
}


/***/ }),
/* 28 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function(shariff) {
  var url = encodeURIComponent(shariff.getURL())
  var title = encodeURIComponent(shariff.getTitle())

  if (title !== '') {
    title = '&title=' + title
  }

  return {
    popup: true,
    shareText: {
      'bg': 'cподеляне',
      'cs': 'sdílet',
      'da': 'del',
      'de': 'teilen',
      'en': 'share',
      'es': 'compartir',
      'fi': 'Jaa',
      'fr': 'partager',
      'hr': 'podijelite',
      'hu': 'megosztás',
      'it': 'condividi',
      'ja': '共有',
      'ko': '공유하기',
      'nl': 'delen',
      'no': 'del',
      'pl': 'udostępnij',
      'pt': 'compartilhar',
      'ro': 'partajează',
      'ru': 'поделиться',
      'sk': 'zdieľať',
      'sl': 'deli',
      'sr': 'podeli',
      'sv': 'dela',
      'tr': 'paylaş',
      'zh': '分享'
    },
    name: 'reddit',
    faPrefix: 'fab',
    faName: 'fa-reddit-alien',
    title: {
      'bg': 'Сподели в Reddit',
      'cs': 'Sdílet na Redditu',
      'da': 'Del på Reddit',
      'de': 'Bei Reddit teilen',
      'en': 'Share on Reddit',
      'es': 'Compartir en Reddit',
      'fi': 'Jaa Redditissä',
      'fr': 'Partager sur Reddit',
      'hr': 'Podijelite na Reddit',
      'hu': 'Megosztás Redditen',
      'it': 'Condividi su Reddit',
      'ja': 'Reddit上で共有',
      'ko': 'Reddit에서 공유하기',
      'nl': 'Delen op Reddit',
      'no': 'Del på Reddit',
      'pl': 'Udostępnij przez Reddit',
      'pt': 'Compartilhar no Reddit',
      'ro': 'Partajează pe Reddit',
      'ru': 'Поделиться на Reddit',
      'sk': 'Zdieľať na Reddit',
      'sl': 'Deli na Reddit',
      'sr': 'Podeli na Reddit-u',
      'sv': 'Dela på Reddit',
      'tr': 'Reddit\'ta paylaş',
      'zh': '分享至Reddit'
    },
    shareUrl: 'https://reddit.com/submit?url=' + url + title + shariff.getReferrerTrack()
  }
}


/***/ }),
/* 29 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function(shariff) {
  var url = encodeURIComponent(shariff.getURL())
  var title = encodeURIComponent(shariff.getTitle())

  if (title !== '') {
    title = '&title=' + title
  }

  return {
    popup: true,
    shareText: {
      'bg': 'cподеляне',
      'cs': 'sdílet',
      'da': 'del',
      'de': 'teilen',
      'en': 'share',
      'es': 'compartir',
      'fi': 'Jaa',
      'fr': 'partager',
      'hr': 'podijelite',
      'hu': 'megosztás',
      'it': 'condividi',
      'ja': '共有',
      'ko': '공유하기',
      'nl': 'delen',
      'no': 'del',
      'pl': 'udostępnij',
      'pt': 'compartilhar',
      'ro': 'partajează',
      'ru': 'поделиться',
      'sk': 'zdieľať',
      'sl': 'deli',
      'sr': 'podeli',
      'sv': 'dela',
      'tr': 'paylaş',
      'zh': '分享'
    },
    name: 'stumbleupon',
    faPrefix: 'fab',
    faName: 'fa-stumbleupon',
    title: {
      'bg': 'Сподели в Stumbleupon',
      'cs': 'Sdílet na Stumbleuponu',
      'da': 'Del på Stumbleupon',
      'de': 'Bei Stumbleupon teilen',
      'en': 'Share on Stumbleupon',
      'es': 'Compartir en Stumbleupon',
      'fi': 'Jaa Stumbleuponissä',
      'fr': 'Partager sur Stumbleupon',
      'hr': 'Podijelite na Stumbleupon',
      'hu': 'Megosztás Stumbleupon',
      'it': 'Condividi su Stumbleupon',
      'ja': 'Stumbleupon上で共有',
      'ko': 'Stumbleupon에서 공유하기',
      'nl': 'Delen op Stumbleupon',
      'no': 'Del på Stumbleupon',
      'pl': 'Udostępnij przez Stumbleupon',
      'pt': 'Compartilhar no Stumbleupon',
      'ro': 'Partajează pe Stumbleupon',
      'ru': 'Поделиться на Stumbleupon',
      'sk': 'Zdieľať na Stumbleupon',
      'sl': 'Deli na Stumbleupon',
      'sr': 'Podeli na Stumbleupon-u',
      'sv': 'Dela på Stumbleupon',
      'tr': 'Stumbleupon\'ta paylaş',
      'zh': '分享至Stumbleupon'
    },
    shareUrl: 'https://www.stumbleupon.com/submit?url=' + url + title + shariff.getReferrerTrack()
  }
}


/***/ }),
/* 30 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function(shariff) {
  var url = encodeURIComponent(shariff.getURL())

  return {
    popup: true,
    shareText: {
      'bg': 'cподеляне',
      'cs': 'sdílet',
      'da': 'del',
      'de': 'teilen',
      'en': 'share',
      'es': 'compartir',
      'fi': 'Jaa',
      'fr': 'partager',
      'hr': 'podijelite',
      'hu': 'megosztás',
      'it': 'condividi',
      'ja': '共有',
      'ko': '공유하기',
      'nl': 'delen',
      'no': 'del',
      'pl': 'udostępnij',
      'pt': 'compartilhar',
      'ro': 'partajează',
      'ru': 'поделиться',
      'sk': 'zdieľať',
      'sl': 'deli',
      'sr': 'podeli',
      'sv': 'dela',
      'tr': 'paylaş',
      'zh': '分享'
    },
    name: 'telegram',
    faPrefix: 'fab',
    faName: 'fa-telegram',
    title: {
      'bg': 'Сподели в Telegram',
      'cs': 'Sdílet na Telegramu',
      'da': 'Del på Telegram',
      'de': 'Bei Telegram teilen',
      'en': 'Share on Telegram',
      'es': 'Compartir en Telegram',
      'fi': 'Jaa Telegramissä',
      'fr': 'Partager sur Telegram',
      'hr': 'Podijelite na Telegram',
      'hu': 'Megosztás Telegramen',
      'it': 'Condividi su Telegram',
      'ja': 'Telegram上で共有',
      'ko': 'Telegram에서 공유하기',
      'nl': 'Delen op Telegram',
      'no': 'Del på Telegram',
      'pl': 'Udostępnij przez Telegram',
      'pt': 'Compartilhar no Telegram',
      'ro': 'Partajează pe Telegram',
      'ru': 'Поделиться на Telegram',
      'sk': 'Zdieľať na Telegram',
      'sl': 'Deli na Telegram',
      'sr': 'Podeli na Telegram-u',
      'sv': 'Dela på Telegram',
      'tr': 'Telegram\'ta paylaş',
      'zh': '在Telegram上分享'
    },
    shareUrl: 'https://t.me/share/url?url=' + url + shariff.getReferrerTrack()
  }
}


/***/ }),
/* 31 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function(shariff) {
  var url = encodeURIComponent(shariff.getURL())

  var title = shariff.getTitle()

  return {
    popup: true,
    shareText: {
      'bg': 'cподеляне',
      'cs': 'sdílet',
      'da': 'del',
      'de': 'teilen',
      'en': 'share',
      'es': 'compartir',
      'fi': 'Jaa',
      'fr': 'partager',
      'hr': 'podijelite',
      'hu': 'megosztás',
      'it': 'condividi',
      'ja': '共有',
      'ko': '공유하기',
      'nl': 'delen',
      'no': 'del',
      'pl': 'udostępnij',
      'pt': 'compartilhar',
      'ro': 'partajează',
      'ru': 'поделиться',
      'sk': 'zdieľať',
      'sl': 'deli',
      'sr': 'podeli',
      'sv': 'dela',
      'tr': 'paylaş',
      'zh': '分享'
    },
    name: 'tencent-weibo',
    faPrefix: 'fab',
    faName: 'fa-tencent-weibo',
    title: {
      'bg': 'Сподели в tencent weibo',
      'cs': 'Sdílet na tencent weibo',
      'da': 'Del på tencent weibo',
      'de': 'Bei tencent weibo teilen',
      'en': 'Share on tencent weibo',
      'es': 'Compartir en tencent weibo',
      'fi': 'Jaa tencent weiboissä',
      'fr': 'Partager sur tencent weibo',
      'hr': 'Podijelite na tencent weibo',
      'hu': 'Megosztás tencent weiboen',
      'it': 'Condividi su tencent weibo',
      'ja': 'Tencent weibo上で共有',
      'ko': 'Tencent weibo에서 공유하기',
      'nl': 'Delen op tencent weibo',
      'no': 'Del på tencent weibo',
      'pl': 'Udostępnij przez tencent weibo',
      'pt': 'Compartilhar no tencent weibo',
      'ro': 'Partajează pe tencent weibo',
      'ru': 'Поделиться на tencent weibo',
      'sk': 'Zdieľať na tencent weibo',
      'sl': 'Deli na tencent weibo',
      'sr': 'Podeli na tencent weibo-u',
      'sv': 'Dela på tencent weibo',
      'tr': 'Tencent weibo\'ta paylaş',
      'zh': '分享至腾讯微博'
    },
    shareUrl: 'http://v.t.qq.com/share/share.php?url=' + url + '&title=' + title + shariff.getReferrerTrack()
  }
}


/***/ }),
/* 32 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function(shariff) {
  var url = encodeURIComponent(shariff.getURL())

  var title = shariff.getTitle()

  return {
    popup: false,
    shareText: {
      'bg': 'cподеляне',
      'cs': 'sdílet',
      'da': 'del',
      'de': 'teilen',
      'en': 'share',
      'es': 'compartir',
      'fi': 'Jaa',
      'fr': 'partager',
      'hr': 'podijelite',
      'hu': 'megosztás',
      'it': 'condividi',
      'ja': '共有',
      'ko': '공유하기',
      'nl': 'delen',
      'no': 'del',
      'pl': 'udostępnij',
      'pt': 'compartilhar',
      'ro': 'partajează',
      'ru': 'поделиться',
      'sk': 'zdieľať',
      'sl': 'deli',
      'sr': 'podeli',
      'sv': 'dela',
      'tr': 'paylaş',
      'zh': '分享'
    },
    name: 'threema',
    faPrefix: 'fas',
    faName: 'fa-lock',
    title: {
      'bg': 'Сподели в Threema',
      'cs': 'Sdílet na Threema',
      'da': 'Del på Threema',
      'de': 'Bei Threema teilen',
      'en': 'Share on Threema',
      'es': 'Compartir en Threema',
      'fi': 'Jaa Threemaissä',
      'fr': 'Partager sur Threema',
      'hr': 'Podijelite na Threema',
      'hu': 'Megosztás Threemaen',
      'it': 'Condividi su Threema',
      'ja': 'Threema上で共有',
      'ko': 'Threema에서 공유하기',
      'nl': 'Delen op Threema',
      'no': 'Del på Threema',
      'pl': 'Udostępnij przez Threema',
      'pt': 'Compartilhar no Threema',
      'ro': 'Partajează pe Threema',
      'ru': 'Поделиться на Threema',
      'sk': 'Zdieľať na Threema',
      'sl': 'Deli na Threema',
      'sr': 'Podeli na Threema-u',
      'sv': 'Dela på Threema',
      'tr': 'Threema\'ta paylaş',
      'zh': '在Threema上分享'
    },
    shareUrl: 'threema://compose?text=' + encodeURIComponent(title) + '%20' + url + shariff.getReferrerTrack()
  }
}


/***/ }),
/* 33 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function(shariff) {
  var url = encodeURIComponent(shariff.getURL())

  return {
    popup: true,
    shareText: {
      'bg': 'cподеляне',
      'cs': 'sdílet',
      'da': 'del',
      'de': 'teilen',
      'en': 'share',
      'es': 'compartir',
      'fi': 'Jaa',
      'fr': 'partager',
      'hr': 'podijelite',
      'hu': 'megosztás',
      'it': 'condividi',
      'ja': '共有',
      'ko': '공유하기',
      'nl': 'delen',
      'no': 'del',
      'pl': 'udostępnij',
      'pt': 'compartilhar',
      'ro': 'partajează',
      'ru': 'поделиться',
      'sk': 'zdieľať',
      'sl': 'deli',
      'sr': 'podeli',
      'sv': 'dela',
      'tr': 'paylaş',
      'zh': '分享'
    },
    name: 'tumblr',
    faPrefix: 'fab',
    faName: 'fa-tumblr',
    title: {
      'bg': 'Сподели в tumblr',
      'cs': 'Sdílet na tumblru',
      'da': 'Del på tumblr',
      'de': 'Bei tumblr teilen',
      'en': 'Share on tumblr',
      'es': 'Compartir en tumblr',
      'fi': 'Jaa tumblrissä',
      'fr': 'Partager sur tumblr',
      'hr': 'Podijelite na tumblr',
      'hu': 'Megosztás tumblren',
      'it': 'Condividi su tumblr',
      'ja': 'tumblr上で共有',
      'ko': 'tumblr에서 공유하기',
      'nl': 'Delen op tumblr',
      'no': 'Del på tumblr',
      'pl': 'Udostępnij przez tumblr',
      'pt': 'Compartilhar no tumblr',
      'ro': 'Partajează pe tumblr',
      'ru': 'Поделиться на tumblr',
      'sk': 'Zdieľať na tumblr',
      'sl': 'Deli na tumblr',
      'sr': 'Podeli na tumblr-u',
      'sv': 'Dela på tumblr',
      'tr': 'tumblr\'ta paylaş',
      'zh': '在tumblr上分享'
    },
    shareUrl: 'http://tumblr.com/widgets/share/tool?canonicalUrl=' + url + shariff.getReferrerTrack()
  }
}


/***/ }),
/* 34 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var url = __webpack_require__(0)

// abbreviate at last blank before length and add "\u2026" (horizontal ellipsis)
var abbreviateText = function(text, length) {
  var div = document.createElement('div')
  var node = document.createTextNode(text)
  div.appendChild(node)
  var abbreviated = div.textContent
  if (abbreviated.length <= length) {
    return text
  }

  var lastWhitespaceIndex = abbreviated.substring(0, length - 1).lastIndexOf(' ')
  abbreviated = abbreviated.substring(0, lastWhitespaceIndex) + '\u2026'

  return abbreviated
}

module.exports = function(shariff) {
  var shareUrl = url.parse('https://twitter.com/intent/tweet', true)

  var title = shariff.getTitle()

  // 120 is the max character count left after twitters automatic url shortening with t.co
  shareUrl.query.text = abbreviateText(title, 120)
  shareUrl.query.url = shariff.getURL()
  if (shariff.options.twitterVia !== null) {
    shareUrl.query.via = shariff.options.twitterVia
  }
  delete shareUrl.search

  return {
    popup: true,
    shareText: {
      'en': 'tweet',
      'ja': 'のつぶやき',
      'ko': '짹짹',
      'ru': 'твит',
      'sr': 'твеет',
      'zh': '鸣叫'
    },
    name: 'twitter',
    faPrefix: 'fab',
    faName: 'fa-twitter',
    title: {
      'bg': 'Сподели в Twitter',
      'cs': 'Sdílet na Twiiteru',
      'da': 'Del på Twitter',
      'de': 'Bei Twitter teilen',
      'en': 'Share on Twitter',
      'es': 'Compartir en Twitter',
      'fi': 'Jaa Twitterissä',
      'fr': 'Partager sur Twitter',
      'hr': 'Podijelite na Twitteru',
      'hu': 'Megosztás Twitteren',
      'it': 'Condividi su Twitter',
      'ja': 'ツイッター上で共有',
      'ko': '트위터에서 공유하기',
      'nl': 'Delen op Twitter',
      'no': 'Del på Twitter',
      'pl': 'Udostępnij na Twitterze',
      'pt': 'Compartilhar no Twitter',
      'ro': 'Partajează pe Twitter',
      'ru': 'Поделиться на Twitter',
      'sk': 'Zdieľať na Twitteri',
      'sl': 'Deli na Twitterju',
      'sr': 'Podeli na Twitter-u',
      'sv': 'Dela på Twitter',
      'tr': 'Twitter\'da paylaş',
      'zh': '在Twitter上分享'
    },
    // shareUrl: 'https://twitter.com/intent/tweet?text='+ shariff.getShareText() + '&url=' + url
    shareUrl: url.format(shareUrl) + shariff.getReferrerTrack()
  }
}


/***/ }),
/* 35 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function(shariff) {
  var url = encodeURIComponent(shariff.getURL())
  return {
    popup: true,
    shareText: {
      'bg': 'cподеляне',
      'cs': 'sdílet',
      'da': 'del',
      'de': 'teilen',
      'en': 'share',
      'es': 'compartir',
      'fi': 'Jaa',
      'fr': 'partager',
      'hr': 'podijelite',
      'hu': 'megosztás',
      'it': 'condividi',
      'ja': '共有',
      'ko': '공유하기',
      'nl': 'delen',
      'no': 'del',
      'pl': 'udostępnij',
      'pt': 'compartilhar',
      'ro': 'partajează',
      'ru': 'поделиться',
      'sk': 'zdieľať',
      'sl': 'deli',
      'sr': 'podeli',
      'sv': 'dela',
      'tr': 'paylaş',
      'zh': '分享'
    },
    name: 'vk',
    faPrefix: 'fab',
    faName: 'fa-vk',
    title: {
      'bg': 'Сподели във VK',
      'cs': 'Sdílet na VKu',
      'da': 'Del på VK',
      'de': 'Bei VK teilen',
      'en': 'Share on VK',
      'es': 'Compartir en VK',
      'fi': 'Jaa VKissa',
      'fr': 'Partager sur VK',
      'hr': 'Podijelite na VKu',
      'hu': 'Megosztás VKon',
      'it': 'Condividi su VK',
      'ja': 'フェイスブック上で共有',
      'ko': '페이스북에서 공유하기',
      'nl': 'Delen op VK',
      'no': 'Del på VK',
      'pl': 'Udostępnij na VKu',
      'pt': 'Compartilhar no VK',
      'ro': 'Partajează pe VK',
      'ru': 'Поделиться на ВКонтакте',
      'sk': 'Zdieľať na VKu',
      'sl': 'Deli na VKu',
      'sr': 'Podeli na VK-u',
      'sv': 'Dela på VK',
      'tr': 'VK\'ta paylaş',
      'zh': '在VK上分享',
    },
    shareUrl: 'https://vk.com/share.php?url=' + url + shariff.getReferrerTrack()
  }
}


/***/ }),
/* 36 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function(shariff) {
  var url = encodeURIComponent(shariff.getURL())

  var title = shariff.getTitle()

  return {
    popup: true,
    shareText: {
      'bg': 'cподеляне',
      'cs': 'sdílet',
      'da': 'del',
      'de': 'teilen',
      'en': 'share',
      'es': 'compartir',
      'fi': 'Jaa',
      'fr': 'partager',
      'hr': 'podijelite',
      'hu': 'megosztás',
      'it': 'condividi',
      'ja': '共有',
      'ko': '공유하기',
      'nl': 'delen',
      'no': 'del',
      'pl': 'udostępnij',
      'pt': 'compartilhar',
      'ro': 'partajează',
      'ru': 'поделиться',
      'sk': 'zdieľať',
      'sl': 'deli',
      'sr': 'podeli',
      'sv': 'dela',
      'tr': 'paylaş',
      'zh': '分享'
    },
    name: 'weibo',
    faPrefix: 'fab',
    faName: 'fa-weibo',
    title: {
      'bg': 'Сподели в weibo',
      'cs': 'Sdílet na weibo',
      'da': 'Del på weibo',
      'de': 'Bei weibo teilen',
      'en': 'Share on weibo',
      'es': 'Compartir en weibo',
      'fi': 'Jaa weiboissä',
      'fr': 'Partager sur weibo',
      'hr': 'Podijelite na weibo',
      'hu': 'Megosztás weiboen',
      'it': 'Condividi su weibo',
      'ja': 'Weibo上で共有',
      'ko': 'Weibo에서 공유하기',
      'nl': 'Delen op weibo',
      'no': 'Del på weibo',
      'pl': 'Udostępnij przez weibo',
      'pt': 'Compartilhar no weibo',
      'ro': 'Partajează pe weibo',
      'ru': 'Поделиться на weibo',
      'sk': 'Zdieľať na weibo',
      'sl': 'Deli na weibo',
      'sr': 'Podeli na weibo-u',
      'sv': 'Dela på weibo',
      'tr': 'Weibo\'ta paylaş',
      'zh': '分享至新浪微博'
    },
    shareUrl: 'http://service.weibo.com/share/share.php?url=' + url + '&title=' + title + shariff.getReferrerTrack()
  }
}


/***/ }),
/* 37 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function(shariff) {
  var url = encodeURIComponent(shariff.getURL())

  var title = shariff.getTitle()

  return {
    popup: false,
    shareText: {
      'bg': 'cподеляне',
      'cs': 'sdílet',
      'da': 'del',
      'de': 'teilen',
      'en': 'share',
      'es': 'compartir',
      'fi': 'Jaa',
      'fr': 'partager',
      'hr': 'podijelite',
      'hu': 'megosztás',
      'it': 'condividi',
      'ja': '共有',
      'ko': '공유하기',
      'nl': 'delen',
      'no': 'del',
      'pl': 'udostępnij',
      'pt': 'compartilhar',
      'ro': 'partajează',
      'ru': 'поделиться',
      'sk': 'zdieľať',
      'sl': 'deli',
      'sr': 'podeli',
      'sv': 'dela',
      'tr': 'paylaş',
      'zh': '分享'
    },
    name: 'whatsapp',
    faPrefix: 'fab',
    faName: 'fa-whatsapp',
    title: {
      'bg': 'Сподели в Whatsapp',
      'cs': 'Sdílet na Whatsappu',
      'da': 'Del på Whatsapp',
      'de': 'Bei Whatsapp teilen',
      'en': 'Share on Whatsapp',
      'es': 'Compartir en Whatsapp',
      'fi': 'Jaa WhatsAppissä',
      'fr': 'Partager sur Whatsapp',
      'hr': 'Podijelite na Whatsapp',
      'hu': 'Megosztás WhatsAppen',
      'it': 'Condividi su Whatsapp',
      'ja': 'Whatsapp上で共有',
      'ko': 'Whatsapp에서 공유하기',
      'nl': 'Delen op Whatsapp',
      'no': 'Del på Whatsapp',
      'pl': 'Udostępnij przez WhatsApp',
      'pt': 'Compartilhar no Whatsapp',
      'ro': 'Partajează pe Whatsapp',
      'ru': 'Поделиться на Whatsapp',
      'sk': 'Zdieľať na Whatsapp',
      'sl': 'Deli na Whatsapp',
      'sr': 'Podeli na WhatsApp-u',
      'sv': 'Dela på Whatsapp',
      'tr': 'Whatsapp\'ta paylaş',
      'zh': '在Whatsapp上分享'
    },
    shareUrl: 'whatsapp://send?text=' + encodeURIComponent(title) + '%20' + url + shariff.getReferrerTrack()
  }
}


/***/ }),
/* 38 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function(shariff) {
  var url = encodeURIComponent(shariff.getURL())
  return {
    popup: true,
    shareText: {
      'bg': 'cподеляне',
      'cs': 'sdílet',
      'da': 'del',
      'de': 'teilen',
      'en': 'share',
      'es': 'compartir',
      'fi': 'Jaa',
      'fr': 'partager',
      'hr': 'podijelite',
      'hu': 'megosztás',
      'it': 'condividi',
      'ja': '共有',
      'ko': '공유하기',
      'nl': 'delen',
      'no': 'del',
      'pl': 'udostępnij',
      'pt': 'compartilhar',
      'ro': 'partajează',
      'ru': 'поделиться',
      'sk': 'zdieľať',
      'sl': 'deli',
      'sr': 'podeli',
      'sv': 'dela',
      'tr': 'paylaş',
      'zh': '分享'
    },
    name: 'xing',
    faPrefix: 'fab',
    faName: 'fa-xing',
    title: {
      'bg': 'Сподели в XING',
      'cs': 'Sdílet na XINGu',
      'da': 'Del på XING',
      'de': 'Bei XING teilen',
      'en': 'Share on XING',
      'es': 'Compartir en XING',
      'fi': 'Jaa XINGissä',
      'fr': 'Partager sur XING',
      'hr': 'Podijelite na XING',
      'hu': 'Megosztás XINGen',
      'it': 'Condividi su XING',
      'ja': 'XING上で共有',
      'ko': 'XING에서 공유하기',
      'nl': 'Delen op XING',
      'no': 'Del på XING',
      'pl': 'Udostępnij przez XING',
      'pt': 'Compartilhar no XING',
      'ro': 'Partajează pe XING',
      'ru': 'Поделиться на XING',
      'sk': 'Zdieľať na XING',
      'sl': 'Deli na XING',
      'sr': 'Podeli na XING-u',
      'sv': 'Dela på XING',
      'tr': 'XING\'ta paylaş',
      'zh': '分享至XING'
    },
    shareUrl: 'https://www.xing.com/social_plugins/share?url=' + url + shariff.getReferrerTrack()
  }
}


/***/ }),
/* 39 */
/***/ (function(module, exports) {

// removed by extract-text-webpack-plugin

/***/ })
],[5]);