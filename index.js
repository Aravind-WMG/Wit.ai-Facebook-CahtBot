'use strict';

// Messenger API integration example
// We assume you have:
// * a Wit.ai bot setup (https://wit.ai/docs/quickstart)
// * a Messenger Platform setup (https://developers.facebook.com/docs/messenger-platform/quickstart)
// You need to `npm install` the following dependencies: body-parser, express, request.
//
// 1. npm install body-parser express request
// 2. Download and install ngrok from https://ngrok.com/download
// 3. ./ngrok http 8445
// 4. WIT_TOKEN=your_access_token FB_APP_SECRET=your_app_secret FB_PAGE_TOKEN=your_page_token node examples/messenger.js
// 5. Subscribe your page to the Webhooks using verify_token and `https://<your_ngrok_io>/webhook` as callback URL.
// 6. Talk to your bot on Messenger!

const bodyParser = require('body-parser');
const crypto = require('crypto');
const express = require('express');
const fetch = require('node-fetch');
const request = require('request');
var firebase = require('firebase');


let Wit = null;
let log = null;
let interactive = null;
try {
  // if running from repo
  Wit = require('../').Wit;
  log = require('../').log;
  interactive = require('../').interactive;
} catch (e) {
  Wit = require('node-wit').Wit;
  log = require('node-wit').log;
  interactive = require('node-wit').interactive;
}

// Webserver parameter
const PORT = process.env.PORT || 8445;

// Wit.ai parameters
const WIT_TOKEN = process.env.WIT_TOKEN;

// Messenger API parameters
const FB_PAGE_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
if (!FB_PAGE_TOKEN) { throw new Error('missing FB_PAGE_TOKEN') }
const FB_APP_SECRET = process.env.FB_APP_SECRET;
if (!FB_APP_SECRET) { throw new Error('missing FB_APP_SECRET') }
const vtoken = process.env.FB_VERIFY_ACCESS_TOKEN;


// ----------------------------------------------------------------------------
// Messenger API specific code

// See the Send API reference
// https://developers.facebook.com/docs/messenger-platform/send-api-reference

const fbMessage = (id, text) => {
  const body = JSON.stringify({
    recipient: { id },
    message: { text },
  });
  const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
  return fetch('https://graph.facebook.com/me/messages?' + qs, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body,
  })
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message);
    }
    return json;
  });
};
var MESSAGES_PATH = 'https://graph.facebook.com/v2.6/me/messages';

function sendMessage(payload) {
  console.log('-> sendMessage', payload);
  return fetch(MESSAGES_PATH + '?access_token=' + FB_PAGE_TOKEN, {
    method: 'POST',
    headers: {
     'Accept': 'application/json',
     'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }).then(x => x.json())
  .then(json => console.log('sendMessage -> ', json))
}

// ----------------------------------------------------------------------------
// Wit.ai bot specific code

// This will contain all user sessions.
// Each session has an entry:
// sessionId -> {fbid: facebookUserId, context: sessionState}
const sessions = {};

const findOrCreateSession = (fbid) => {
  let sessionId;
  // Let's see if we already have a session for the user fbid
  Object.keys(sessions).forEach(k => {
    if (sessions[k].fbid === fbid) {
      // Yep, got it!
      sessionId = k;
    }
  });
  if (!sessionId) {
    // No session found for user fbid, let's create a new one
    sessionId = new Date().toISOString();
    sessions[sessionId] = {fbid: fbid, context: {}};
  }
  return sessionId;
};

  const firstEntityValue = (entities, entity) => {
  const val = entities && entities[entity] &&
    Array.isArray(entities[entity]) &&
    entities[entity].length > 0 &&
    entities[entity][0].value
  ;
  if (!val) {
    return null;
  }
  return typeof val === 'object' ? val.value : val; 
};

// Our bot actions
const actions = {
  send({sessionId}, {text}) {
    // Our bot has something to say!
    // Let's retrieve the Facebook user whose session belongs to
    const recipientId = sessions[sessionId].fbid;
    if (recipientId) {
      // Yay, we found our recipient!
      // Let's forward our bot response to her.
      // We return a promise to let our bot know when we're done sending
      return fbMessage(recipientId, text)
      .then(() => null)
      .catch((err) => {
        console.error(
          'Oops! An error occurred while forwarding the response to',
          recipientId,
          ':',
          err.stack || err
        );
      });
    } else {
      console.error('Oops! Couldn\'t find user for session:', sessionId);
      // Giving the wheel back to our bot
      return Promise.resolve()
    }
  },
  // You should implement your custom actions here
  // See https://wit.ai/docs/quickstart
  
  getForecast(request) {
	var context = request.context;
    var entities = request.entities;
    var location = firstEntityValue(entities, 'location');
    if (location) {
        context.location = location;
        return fetch(
          'https://api.apixu.com/v1/forecast.json?' +
          'key=8d1bc0ace03d457ca9b164802162808' +
          '&q=' + location
        )
        .then(function(response) { return response.json(); })
        .then(function(responseJSON) { 
          context.fetchForecast = responseJSON.current.temp_c + ' C';
          return context;
        });
      } else {
        //context.missingLocation = true;
        delete context.fetchForecast;
      }
    //return context;
  },
  
   getNews({context, entities,sessionId}) {
	//var context = request.context;
    //var entities = request.entities;
	var fbid = sessions[sessionId].fbid;
    sendMessage({
        recipient: {id: fbid},
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'generic',
              elements: [{
                title: "JASON DERULO NEWS",
                subtitle: "TPLATINUM HITS ALBUM AVAILABLE FOR 99CENTS FOR A LIMITED TIME!",
				image_url:"http://www.jasonderulo.com/sites/g/files/g2000004951/f/201609/platinum-hits-album-extralarge_1467244189012.jpg",
                item_url: "http://www.jasonderulo.com/news",               
                buttons: [{
                  type: "web_url",
                  url: "http://www.jasonderulo.com/news/platinum-hits-album-available-99cents-limited-time-80381",
                  title: "READ MORE"
                }],
              },{
                title: "JASON DERULO NEWS",
                subtitle: "CATCH JASON DERULO PERFORM HELLO FRIDAY WITH FLO RIDA ON JIMMY KIMMEL TONIGHT!",
				image_url:"http://www.jasonderulo.com/sites/g/files/g2000004951/f/201607/jd.jpg",
                item_url: "http://www.jasonderulo.com/news",               
                buttons: [{
                  type: "web_url",
                  url: "http://www.jasonderulo.com/news/catch-jason-derulo-perform-hello-friday-flo-rida-jimmy-kimmel-tonight-79756",
                  title: "READ MORE"
                }],
              }]
            }
          }
        }
      });
      return context;   
  },
     getMerch({context, entities,sessionId}) {
	//var context = request.context;
    //var entities = request.entities;
	var fbid = sessions[sessionId].fbid;
    sendMessage({
        recipient: {id: fbid},
        message: {
		attachment: {
        type: "template",
        payload: {
            template_type: "list",
            elements: [
                {
                    title: "JASON DERULO",
                    image_url: "http://img.cdn2.wmgecom.com/media/catalog/product/cache/864/image/600x/9df78eab33525d08d6e5fb8d27136e95/0/9/093624941101.jpg",
                    subtitle: "TATTOOS EP DIGITAL ALBUM",
                    default_action: {
                        type: "web_url",
                        url: "http://store.warnermusic.com/warner-bros-records/artists/jason-derulo/tattoos-ep-digital-album-1.html",
                        webview_height_ratio: "tall"
                    },
                    buttons: [
                        {
                            title: "Shop Now",
                            type: "web_url",
                            url: "http://store.warnermusic.com/warner-bros-records/artists/jason-derulo/tattoos-ep-digital-album-1.html",
                            webview_height_ratio: "tall"                   
                        }
                    ]
                },
                {
                    title: "JASON DERULO",
                    image_url: "http://img.cdn2.wmgecom.com/media/catalog/product/cache/864/image/600x/9df78eab33525d08d6e5fb8d27136e95/j/d/jd_takdirtytattoo_flat_f.png",
                    subtitle: "TALK DIRTY JUNIORS T-SHIRT",
                    default_action: {
                        type: "web_url",
                        url: "http://store.warnermusic.com/warner-bros-records/artists/jason-derulo/talk-dirty-juniors-t-shirt-3.html",
                        webview_height_ratio: "tall"
                    },
                    buttons: [
                        {
                            title: "Shop Now",
                            type: "web_url",
                            url: "http://store.warnermusic.com/warner-bros-records/artists/jason-derulo/talk-dirty-juniors-t-shirt-3.html",
                            webview_height_ratio: "tall"               
                        }
                    ]                
                },
                {
                    title: "JASON DERULO",
                    image_url: "http://img.cdn2.wmgecom.com/media/catalog/product/cache/864/image/600x/9df78eab33525d08d6e5fb8d27136e95/j/a/jason-derulo-talk-dirty-400x400.jpg",
                    subtitle: "TALK DIRTY CD",
                    default_action: {
                        type: "web_url",
                        url: "http://store.warnermusic.com/warner-bros-records/artists/jason-derulo/talk-dirty-cd-1.html",
                        webview_height_ratio: "tall"
                    },
                    buttons: [
                        {
                            title: "Shop Now",
                            type: "web_url",
                            url: "http://store.warnermusic.com/warner-bros-records/artists/jason-derulo/talk-dirty-cd-1.html",
                            webview_height_ratio: "tall"                   
                        }
                    ]                
                },
                {
                    title: "JASON DERULO",
                    image_url: "http://img.cdn2.wmgecom.com/media/catalog/product/cache/864/image/600x/9df78eab33525d08d6e5fb8d27136e95/i/m/image_7060.png",
                    subtitle: "REMISSION T-SHIRT",
                    default_action: {
                        type: "web_url",
                        url: "http://store.warnermusic.com/warner-bros-records/artists/jason-derulo/remission-t-shirt-7.html",
                        webview_height_ratio: "tall"
                    },
                    buttons: [
                        {
                            title: "Shop Now",
                            type: "web_url",
                            url: "http://store.warnermusic.com/warner-bros-records/artists/jason-derulo/remission-t-shirt-7.html",
                            webview_height_ratio: "tall"                    
                        }
                    ]                
                }
            ],
             buttons: [
                {
                    title: "View More",
					type: "web_url",
					url: "http://store.warnermusic.com/warner-bros-records/artists/jason-derulo.html"			
                }
            ]  
        }
    }
        }
      });
      return context;   
  },
       getMusic({context, entities,sessionId}) {
	//var context = request.context;
    //var entities = request.entities;
	var fbid = sessions[sessionId].fbid;
    sendMessage({
        recipient: {id: fbid},
        message: {
		attachment: {
        type: "template",
        payload: {
            template_type: "list",
            elements: [
                {
                    title: "KISS THE SKY",
                    image_url: "http://www.jasonderulo.com/sites/g/files/g2000004951/f/201608/Kiss%20The%20Sky%20%20%281%29.jpg",
                    default_action: {
                        type: "web_url",
                        url: "http://smarturl.it/JD.KissTheSky",
                        webview_height_ratio: "tall"
                    },
                    buttons: [
                        {
                            title: "Buy Now",
                            type: "web_url",
                            url: "http://store.warnermusic.com/warner-bros-records/artists/jason-derulo/tattoos-ep-digital-album-1.html",
                            webview_height_ratio: "tall"                   
                        }
                    ]
                },
                {
                    title: "PLATINUM HITS",
                    image_url: "http://www.jasonderulo.com/sites/g/files/g2000004951/f/201608/Platinum%20Hits%20%20%281%29.jpg",
                    default_action: {
                        type: "web_url",
                        url: "http://smarturl.it/JD.KissTheSky",
                        webview_height_ratio: "tall"
                    },
                    buttons: [
                        {
                            title: "Buy Now",
                            type: "web_url",
                            url: "http://smarturl.it/JD.KissTheSky",
                            webview_height_ratio: "tall"               
                        }
                    ]                
                }
            ],
             buttons: [
                {
                    title: "View More",
					type: "web_url",
					url: "http://www.jasonderulo.com/music"			
                }
            ]  
        }
    }
        }
      });
      return context;   
  },

};

// Setting up our bot
const wit = new Wit({
  accessToken: WIT_TOKEN,
  actions,
  logger: new log.Logger(log.INFO)
});

// Starting our webserver and putting it all together
const app = express();
app.use(({method, url}, rsp, next) => {
  rsp.on('finish', () => {
    console.log(`${rsp.statusCode} ${method} ${url}`);
  });
  next();
});
app.use(bodyParser.json({ verify: verifyRequestSignature }));

// Webhook setup
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === vtoken) {
    res.send(req.query['hub.challenge']);
  } else {
    res.sendStatus(400);
  }
});

// Message handler
app.post('/webhook', (req, res) => {
  // Parse the Messenger payload
  // See the Webhook reference
  // https://developers.facebook.com/docs/messenger-platform/webhook-reference
  const data = req.body;

  if (data.object === 'page') {
    data.entry.forEach(entry => {
      entry.messaging.forEach(event => {
        if (event.message && !event.message.is_echo) {
          // Yay! We got a new message!
          // We retrieve the Facebook user ID of the sender
          const sender = event.sender.id;

          // We retrieve the user's current session, or create one if it doesn't exist
          // This is needed for our bot to figure out the conversation history
          const sessionId = findOrCreateSession(sender);

          // We retrieve the message content
          const {text, attachments} = event.message;

          if (attachments) {
            // We received an attachment
            // Let's reply with an automatic message
            fbMessage(sender, 'Sorry I can only process text messages for now.')
            .catch(console.error);
          } else if (text) {
            // We received a text message

            // Let's forward the message to the Wit.ai Bot Engine
            // This will run all actions until our bot has nothing left to do
            wit.runActions(
              sessionId, // the user's current session
              text, // the user's message
              sessions[sessionId].context // the user's current session state
            ).then((context) => {
              // Our bot did everything it has to do.
              // Now it's waiting for further messages to proceed.
              console.log('Waiting for next user messages');

              // Based on the session state, you might want to reset the session.
              // This depends heavily on the business logic of your bot.
              // Example:
              // if (context['done']) {
              //   delete sessions[sessionId];
              // }

              // Updating the user's current session state
              sessions[sessionId].context = context;
            })
            .catch((err) => {
              console.error('Oops! Got an error from Wit: ', err.stack || err);
            })
          }
        } else {
          console.log('received event', JSON.stringify(event));
        }
      });
    });
  }
  res.sendStatus(200);
});

/*
 * Verify that the callback came from Facebook. Using the App Secret from
 * the App Dashboard, we can verify the signature that is sent with each
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];

  if (!signature) {
    // For testing, let's log an error. In production, you should throw an
    // error.
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', FB_APP_SECRET)
                        .update(buf)
                        .digest('hex');

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

app.listen(PORT);
console.log('Listening on :' + PORT + '...');
