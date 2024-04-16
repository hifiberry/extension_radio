var radio = (function () {

	let selectedRadioService = 'radioBrowser';

	$(document).on("radio", function(event, data) {
		switch (data.header) {
			case "searchResults":
				if (data.content.found_stations) {
					SearchResults(data.content.found_stations);
				}
				break;
			case "homeContent":
				if (data.content.favourites) {
					Favourites(data.content.favourites);
				}
				break;
			case "stationFavourited": 
				if (data.content.guide_id) {
					if (data.content.isFavourite == true) {
						beo.setSymbol('.collection-item[data-guide-id="'+data.content.guide_id+'"] .collection-item-secondary-symbol', './common/symbols-black/star-filled.svg');
					} else {
						beo.setSymbol('.collection-item[data-guide-id="'+data.content.guide_id+'"] .collection-item-secondary-symbol', './common/symbols-black/star.svg');
					}
				}
				break;
		}
	});

	// users pressed ENTER in the search field
	$("#queryString").keypress(function(key) {
	    if (key.which == 13 && $(this).val()) {
	        var query = $(this).val();

			startSearch(query);
	        goTo(2)
	        $("#radio-l2 h1").html("Search Results")
	        $("#search-results").removeClass("hidden")
	    }
	}).keyup(function() {
		if ($(this).val().length < 1) {
	        $(".no-results").css("display", "none")
	    }
	})

	$("#return-l2").click(function() {
		$("#search-results").empty()
		$(".radio-group-l2").empty()
	})

	function startSearch(query) {
		if (selectedRadioService == 'radioBrowser') {
			console.log("rb")
			beo.sendToProduct("radio", {
				header: "radioBrowserSearch",
				content: query
			});
		} else if (selectedRadioService == 'tuneIn') {
			console.log("ti")
			beo.sendToProduct("radio", {
				header: "search",
				content: query
			});
		}
	}

	function SearchResults(radios) {
		if (Object.keys(radios).length > 0) {
			$("#search-results").empty()
			for (item in radios) {
				radio.createCollectionWithImg(radios[item]);
			}
			$(".no-results").css("display", "none")
		} else {
			$(".no-results").css("display", "block")
		}
	}

	function Favourites(radios) {
		if (Object.keys(radios).length > 0) {
			$("#radio-favourites").removeClass("hidden")
			$("#radio-favourite-items").empty()
			for (item in radios) {
				itemOptions = {
					label: radios[item].title,
					icon: radios[item].img,
					iconSize: "small",
					onclick: "radio.playRadio('"+radios[item].url+"', '"+radios[item].title+"');",
					onclickSecondary: "radio.addToFavorite('"+item+"')",
					secondarySymbol: "./common/symbols-black/star-filled.svg",
					data: { "data-guide-id": item }
				}
				$("#radio-favourite-items").append(beo.createCollectionItem(itemOptions));
			}
		} else {
			$("#radio-favourites").addClass("hidden")
		}
	}

	function playRadio(link, title) {
		beo.sendToProduct("radio", { 
			header: "play",
			content: {
				URL: link,
				stationName: title	
			}
		});
	}

	function selectRadioBrowser() {
		$("#radio_browser").addClass("on");
		$("#radio_tunein").removeClass("on");
		selectedRadioService = 'radioBrowser';
	}

	function selectTuneIn() {
		$("#radio_tunein").addClass("on");
		$("#radio_browser").removeClass("on");
		selectedRadioService = 'tuneIn';
	}

	function createCollectionWithImg(item) {
		let secondarySymbol;
		if (item.isFavourite) {
			secondarySymbol = "./common/symbols-black/star-filled.svg";
		} else {
			secondarySymbol = "./common/symbols-black/star.svg";
		}

		let itemIcon = item.image; // Default icon
		if (!itemIcon || itemIcon === "") {
			itemIcon = "/extensions/radio/symbols-black/radio.svg"; // Fallback icon
		}

		let itemOptions = {
			label: item.text,
			icon: itemIcon,
			iconSize: "small",
			onclick: "radio.playRadio('" + item.URL + "', '" + item.text + "');",
			onclickSecondary: "radio.addToFavorite('" + item.guide_id + "')",
			secondarySymbol: secondarySymbol,
			data: { "data-guide-id": item.guide_id }
		};
		$("#search-results").append(beo.createCollectionItem(itemOptions));
	}

	function addToFavorite(stationId) {
		beo.sendToProduct("radio", { 
			header: "add-to-favourite",
			content: { stationId: stationId }
		});
	}

	function goTo(level) {
		beo.showDeepMenu("radio-l"+level);
	}

	return {
		goTo: goTo,
		playRadio: playRadio,
		createCollectionWithImg: createCollectionWithImg,
		addToFavorite: addToFavorite,
		selectTuneIn: selectTuneIn,
		selectRadioBrowser: selectRadioBrowser
	};

}) ();

