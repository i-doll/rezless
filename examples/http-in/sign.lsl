// A sign you update over HTTP. It asks for a URL and tells its owner what it
// is. POST /text to change the sign; GET /text to read it back.
string text = "";

default {
  state_entry() { llRequestURL(); }

  http_request(key id, string method, string body) {
    if (method == URL_REQUEST_GRANTED) {
      llOwnerSay("Sign URL: " + body);
      return;
    }
    if (method == URL_REQUEST_DENIED) {
      llOwnerSay("No URL for the sign: " + body);
      return;
    }
    if (llGetHTTPHeader(id, "x-path-info") != "/text") {
      llHTTPResponse(id, 404, "not found");
    } else if (method == "POST") {
      text = body;
      llSetText(text, <1, 1, 1>, 1.0);
      llHTTPResponse(id, 200, "ok");
    } else if (method == "GET") {
      llHTTPResponse(id, 200, text);
    } else {
      llHTTPResponse(id, 405, "method not allowed");
    }
  }
}
