var version = require("./package.json").version;
var exec    = require( 'child_process' ).exec;
var TuneIn  = require( 'node-tunein-radio');
const dns   = require('dns').promises;

var debug = beo.debug;

var defaultSettings = { "favourites": {} };
var settings = JSON.parse(JSON.stringify(defaultSettings));

var search_results;
var found_stations = {};

var tunein = new TuneIn({
    protocol        : 'https',          
    cacheRequests   : true,             
    cacheTTL        : 1000 * 60 * 30,   
    partnerId       : 'no default'      
});


var radiobrowser_baseurl = "https://de1.api.radio-browser.info"

/**
 * Get a list of base URLs of all available Radio-Browser servers.
 * Returns: Promise that resolves to an array of strings - base URLs of Radio-Browser servers.
 */
function get_radiobrowser_base_urls() {
	return dns.resolveSrv("_api._tcp.radio-browser.info")
		.then(srvRecords => {
			srvRecords.sort((a, b) => a.priority - b.priority || a.weight - b.weight);
			return srvRecords.map(record => `https://${record.name}`);
		});
}

function get_radiobrowser_base_url_random() {
	return get_radiobrowser_base_urls()
		.then(hosts => {
			// Remove the radiobrowser_baseurl if it exists in the hosts list
			const filteredHosts = hosts.filter(host => host !== radiobrowser_baseurl);

			// If there are no hosts left after filtering, return null
			if (filteredHosts.length === 0) {
				console.error("No available Radio-Browser API base URLs other than the current one.");
				return null;
			}

			// Select a random host from the filtered list
			const randomIndex = Math.floor(Math.random() * filteredHosts.length);
			return filteredHosts[randomIndex];
		});
}

function set_random_radiobrowser_url() {
	return new Promise((resolve, reject) => {
		get_radiobrowser_base_url_random()
			.then(baseUrl => {
				console.log("Using Radio-Browser API base URL:", baseUrl);
				radiobrowser_baseurl = baseUrl;
				resolve(baseUrl);
			})
			.catch(error => {
				console.error("Error fetching Radio-Browser API base URL:", error);
				reject(error);
			});
	});
}

function fetchRadioBrowser(url) {
	return fetch(url)
		.then(response => response.json())
		.then(data => {
			console.log(data)
			// Format the stations data or handle it as required by the UI
			let transformedStations = data.map(station => {
				return {
					text: station.name,
					URL: station.url,
					image: station.favicon,
					guide_id: station.stationuuid
				};
			});

			console.log("Transformed")
			console.log(transformedStations)

			beo.sendToUI("radio", {
				header: "searchResults",
				content: {
					found_stations: transformedStations
				}
			});
		})
		.catch(error => {
			console.error('Radio Browser API Error from URL:', url, error);
			return Promise.reject(error);
		});
}

function fetchRadioBrowserWithRetry(path, maxRetries = 5) {
	let retryCount = 0;

	function fetchWithRetry() {
		console.log("Radiobrowser search: ", path);
		return fetchRadioBrowser(radiobrowser_baseurl+path)
			.catch(error => {
				if (retryCount < maxRetries) {
					console.error(`Retrying with a new Radio Browser API URL (${retryCount + 1}/${maxRetries})...`);
					retryCount++;
					return set_random_radiobrowser_url().then(() => {
						console.log('New Radio Browser API URL set.');
						return fetchWithRetry();
					});
				} else {
					console.error(`Reached maximum retry limit (${maxRetries}).`);
					return Promise.reject(error);
				}
			});
	}

	return fetchWithRetry();
}




beo.bus.on('general', function (event) {
	if (event.header == "startup") {
		set_random_radiobrowser_url()
	}

	if (event.header == "activatedExtension") {
		if (event.content.extension == "radio") {
			beo.sendToUI("radio", {
				header: "homeContent", 
				content: {
					favourites: settings.favourites 
				}
			});
		}
	}
});

beo.bus.on('radio', function(event) {
	switch (event.header) {
		case "settings":
			if (event.content.settings) {
				settings = Object.assign(settings, event.content.settings);
			}

			break;
		case "search":
			var query = event.content;
			console.log("Searching tuneIn for "+query)
			tunein.search(query).then(function(result) {

				search_results = result.body;
				found_stations = {};
				
				for (i in search_results) {
					if (search_results[i].item && search_results[i].item == "station") {
						if (search_results[i].formats && search_results[i].formats !== "wma") {
							found_stations[search_results[i].guide_id] = search_results[i];
							if (settings.favourites[search_results[i].guide_id]) {
								found_stations[search_results[i].guide_id].isFavourite = true;
							} else {
								found_stations[search_results[i].guide_id].isFavourite = false;
							}
						}
					}
				}

				beo.sendToUI("radio", {header: "searchResults", content: { found_stations }});

			}).catch(function(err) {
				if (err) {
					if (debug) console.log(err);
				}
			})

			break;

		case "radioBrowserSearch":
			var queryName = event.content.replace(/ /g, '+');
			var path = `/json/stations/byname/${queryName}`;

			fetchRadioBrowserWithRetry(path)
				.catch(error => {
					console.error('Radio Browser API Error after retry:', error);
					// Optionally, send an error message to the UI as well
					beo.sendToUI("radio", {
						header: "searchResults",
						content: { error: 'Failed to fetch stations' }
					});
				});
			break;

		case "play":
			exec('/data/extensions/radio/play-radiostream "'+ event.content.URL +'" "'+event.content.stationName+'"', 
				function(error, stdout, stderr) {
					if (error) {
						if (debug) console.error("Starting radio failed: "+error, stderr);
						} else {
						if (debug) console.log("Starting radio finished.", stdout);
						}
				}
			)

			if (beo.extensions.sources && beo.extensions.sources.setSourceOptions) {
			    beo.extensions.sources.setSourceOptions("radio", {
				    aliasInNowPlaying: event.content.stationName
			    }, true);
			}

			break;
		case "add-to-favourite":
			const { stationId } = event.content;
			const stationDetails = found_stations[stationId];

			// Fallback to existing details if event content doesn't provide new data
			const title = event.content.name || stationDetails?.text;
			const img = event.content.image || stationDetails?.image;
			const url = event.content.url || stationDetails?.URL;

			if (!settings.favourites[stationId]) {
				settings.favourites[stationId] = { title, img, url };
				event.content.isFavourite = true; // Mark as favourite
			} else {
				delete settings.favourites[stationId];
				event.content.isFavourite = false; // Remove from favourites
			}

			// Notify the UI of the update
			beo.sendToUI("radio", {
				header: "stationFavourited",
				content: {
					guide_id: stationId,
					isFavourite: event.content.isFavourite
				}
			});
			beo.sendToUI("radio", {
				header: "homeContent",
				content: {
					favourites: settings.favourites
				}
			});
			beo.saveSettings("radio", settings);
			break;
	}
});

function checkMPDStatus(callback) {
	if (beo.extensions.mpd && beo.extensions.mpd.isEnabled) {
		beo.extensions.mpd.isEnabled(callback);
	}
}

module.exports = {
	version: version,
	isEnabled: checkMPDStatus
};
