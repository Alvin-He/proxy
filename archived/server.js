// Listen on a specific host via the HOST environment variable
var host = process.env.HOST || '127.0.0.1';
// Listen on a specific port via the PORT environment variable
var port = process.env.PORT || 8080;

// Grab the blacklist from the command-line so that we can update the blacklist without deploying
// again. CORS Anywhere is open by design, and this blacklist is not used, except for countering
// immediate abuse (e.g. denial of service). If you want to block all origins except for some,
// use originWhitelist instead.
var originBlacklist = parseEnvList(process.env.CORSANYWHERE_BLACKLIST);
var originWhitelist = parseEnvList(process.env.CORSANYWHERE_WHITELIST);
function parseEnvList(env) {
  if (!env) {
    return [];
  }
  return env.split(',');
}

// Set up rate-limiting to avoid abuse of the public CORS Anywhere server.
// var checkRateLimit = require('./lib/rate-limit')(process.env.CORSANYWHERE_RATELIMIT);

var cors_proxy = require('./lib/cors-anywhere');
cors_proxy.createServer({
  handleInitialRequest: null,         // Function that may handle the request instead, by returning a truthy value.
  //getProxyForUrl: getProxyForUrl,   // Function that specifies the proxy to use
  originBlacklist: originBlacklist,   // Requests from these origins will be blocked.
  originWhitelist: originWhitelist,   // If non-empty, requests not from an origin in this list will be blocked.
  maxRedirects: 5,                    // Maximum number of redirects to be followed.
  // checkRateLimit: checkRateLimit,  // Function that may enforce a rate-limit by returning a non-empty string.
  redirectSameOrigin: false,          // Redirect the client to the requested URL for same-origin requests.
  // requireHeader: [                 // Require a header to be set?
  //   'origin', 
  //   'x-requested-with'
  // ], 
  removeHeaders: [                    // Strip these request headers.
    'cookie',
    'cookie2',
    // Strip Heroku-specific headers
    'x-request-start',
    'x-request-id',
    'via',
    'connect-time',
    'total-route-time',
    // Other Heroku added debug headers
    // 'x-forwarded-for',
    // 'x-forwarded-proto',
    // 'x-forwarded-port',
  ],
  redirectSameOrigin: true,           // Redirect the client to the requested URL for same-origin requests.
  httpProxyOptions: {
    // Do not add X-Forwarded-For, etc. headers, because Heroku already adds it.
    xfwd: true,
  },
  setHeaders: {                       // Set these request headers.
    
  },
  corsMaxAge: 0,                  // If set, an Access-Control-Max-Age header with this value (in seconds) will be added.
}).listen(port, host, function() {
  console.log('Running CORS Anywhere on ' + host + ':' + port);
});
