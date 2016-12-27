var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');

// Save credential at ~/.credentials/gmail-nodejs-quickstart.json
var SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
    process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'gmail-nodejs-quickstart.json';
var TIME_PATH = "./max-time-flag.json";
var READ_MAIL_PATH  = "./read-mails.json"

var gmail = google.gmail('v1');

// List of mails read until this date
var mails;

// Change the storage format based on your requirement
var mailFormat = 'full';

// Max time flag (UNIX Timestamp) for keeping track of mails that have been read till date
var maxInternalDate = '0';

// Load max time flag from max-time-flag.json.
fs.readFile('max-time-flag.json', function getMaxTimeFlag(err, data) {
    if (err) {
        return;
    }

    maxTime = JSON.parse(data);

    maxInternalDate = maxTime.maxInternalDate;
});

// query for getting mails
// fetch the mails after max flag time
var query = "after: " + maxInternalDate;

// Load client secrets from client_secret.json.
fs.readFile('client_secret.json', function processClientSecrets(err, content) {
    if (err) {
        console.log('Error loading client secret file: ' + err);
        return;
    }

    // Authorize and call the listLabels function
    authorize(JSON.parse(content), listMessages);
});

/**
* Create an OAuth2 client with the given credentials, and then execute the
* given callback function.
*
* @param {Object} credentials: The authorization client credentials.
* @param {function} callback: The callback to call with the authorized client.
*/
function authorize(credentials, callback) {
    var clientSecret = credentials.installed.client_secret;
    var clientId = credentials.installed.client_id;
    var redirectUrl = credentials.installed.redirect_uris[0];
    var auth = new googleAuth();
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, function(err, token) {
        if (err) {
            getNewToken(oauth2Client, callback);
        } else {
            oauth2Client.credentials = JSON.parse(token);
            callback(oauth2Client, query, fetchMails);
        }
    });
}

/**
* Get and store new token after prompting for user authorization, and then
* execute the given callback with the authorized OAuth2 client.
*
* @param {google.auth.OAuth2} oauth2Client: The OAuth2 client to get token for.
* @param {getEventsCallback} callback: The callback to call with the authorized
*     client.
*/
function getNewToken(oauth2Client, callback) {
    var authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
    });
    console.log('Authorize this app by visiting this url: ', authUrl);
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question('Enter the code from that page here: ', function(code) {
        rl.close();
        oauth2Client.getToken(code, function(err, token) {
            if (err) {
                console.log('Error while trying to retrieve access token', err);
                return;
            }
            oauth2Client.credentials = token;
            storeToken(token);
            callback(oauth2Client, query, fetchMails);
        });
    });
}

/**
* Store token to disk be used in later program executions.
*
* @param {Object} token The token to store to disk.
*/
function storeToken(token) {
    try {
        fs.mkdirSync(TOKEN_DIR);
    } catch (err) {
        if (err.code != 'EEXIST') {
            throw err;
        }
    }
    fs.writeFile(TOKEN_PATH, JSON.stringify(token));
    console.log('Token stored to ' + TOKEN_PATH);
}

/**
* Fetch the mails in the user's account.
*
* @param {google.auth.OAuth2} auth: An authorized OAuth2 client.
* @param {Array} messages: An array of messages containing message id and
*                          thread id
*/
function fetchMails(auth, messages) {
    console.log(messages.length);

    var fetchMail = function(i) {
        if( i < messages.length) {
            var messageId = messages[i].id;
            console.log(messageId);
            // Fetch the mail with message id
            gmail.users.messages.get({
                'auth' : auth,
                'userId': 'me',
                'id': messageId,
                'format' : mailFormat
            }, function(err, response) {
                if (err) {
                    console.log('The API: messages.get returned an error: ' + err);
                }
                else {
                    // push the response into read mails list
                    mails.push(response);
                    if(response.internalDate > maxInternalDate) {
                        maxInternalDate = response.internalDate;
                    }
                }
                // call fetchMail recursivly
                fetchMail(i+1);
            });
        }
        else {
            var readMails = {'messages' : mails}

            fs.writeFile(READ_MAIL_PATH, JSON.stringify(readMails));
            console.log('read mails stored to ' + READ_MAIL_PATH);

            storeMaxInternalDate(maxInternalDate);
        }
    };

    // Load read mails from read_mails.json.
    fs.readFile('read-mails.json', function getReadMails(err, data) {
        if (err) {
            mails = [];
        }
        else {
            mails = JSON.parse(data.messages);
        }
        // Initialize fetching mails
        fetchMail(0);
    });
}

/**
* Store token to disk be used in later program executions.
*
* @param {String} maxInternalDate: max date used as flag for latest read email
*/
function storeMaxInternalDate(maxInternalDate) {
    var maxTimeFlag = {'maxInternalDate': maxInternalDate};

    fs.writeFile(TIME_PATH, JSON.stringify(maxTimeFlag));
    console.log('Max Time Flag stored to ' + TIME_PATH);
}
/**
* Retrieve Messages in user's mailbox matching query.
*
* @param {google.auth.OAuth2} auth An authorized OAuth2 client.
* @param  {String} query: String used to filter the Messages listed.
* @param  {Function} callback: Function to call when the request is complete.
*/
function listMessages(auth, query, callback) {
    var  result = [];

    var getMessagesFromPage = function(err, response) {
        if (err) {
            console.log('The API: messages.list returned an error: ' + err);
            return;
        }
        // append message list to the final result message list
        result = result.concat(response.messages);

        // get the net page token
        var nextPageToken = response.nextPageToken;

        // Get message list of next page
        if (nextPageToken) {
            gmail.users.messages.list({
                'auth' : auth,
                'userId': 'me',
                'pageToken': nextPageToken,
                'q': query
            }, getMessagesFromPage);
        } else {
            if(result != 0 && result.length > 0) {
                callback(auth, result);
            }
            else {
                console.log("Your read mails are up to date.");
            }
        }
    }

    // Initialize message fetching
    gmail.users.messages.list({
        'auth' : auth,
        'userId': 'me',
        'q': query
    },  getMessagesFromPage);

}
