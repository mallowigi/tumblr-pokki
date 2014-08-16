if (typeof pokki != "undefined") {
	var pokkiHelper = (function() {
		// Default Constants
		var WINDOW_STATE_NAME = 'saved';

		var windowPrefs = {
			width:     800,
			minWidth:  400,
			maxWidth:  0,
			height:    600,
			minHeight: 300,
			maxHeight: 0
		}

		var helper = {};

		function extend(obj) {
			Array.prototype.slice.call(arguments, 1).forEach( function(source) {
				if (!source) return;
				for (var attr in source) {
					obj[attr] = source[attr];
				}
			});
			return obj;
		}

		function sizeApp() {
			var startWidth = (screen.width >= windowPrefs.width) ? windowPrefs.width : screen.width;
			var startHeight = (screen.height >= windowPrefs.height) ? windowPrefs.height : screen.height;

			pokki.loadWindowState(WINDOW_STATE_NAME, {width:startWidth,height:startHeight});
			pokki.allowResize(true, true, windowPrefs);
		}

		helper.setStartSize = function(width, height) {
			if (width) windowPrefs.width = width;
			if (height) windowPrefs.height = height;
			sizeApp();
		}

		helper.setWindowConstraints = function(options) {
			//Updates any window properties set by the user.
			for (var prop in windowPrefs) {
				for (var key in options) {
					if (prop === key) {
						//console.log('[PROP/KEY]'+prop+' == '+key);
						windowPrefs[prop] = options[key];
					}
				}
			}
			sizeApp();
		}

		helper.backgroundAutoShutdown = function() {
			// Makes the background page shutdown if the app isn't running
			if (!pokki.isAppRunning()) {
				pokki.shutdown(0);
			}
		}

		helper.saveWindowState = function(save) {
			if (save) {
				sizeApp();
				pokki.loadWindowState(WINDOW_STATE_NAME);

				pokki.addEventListener('unload', function() {
					pokki.saveWindowState(WINDOW_STATE_NAME);
				});
			}
		}

		helper.NagReminder = function(options) {
			var eventName = 'Notify Register';

			var nag = {};
			options == options || {};
			options.message == options.message || {};
			options.message.data = options.message.data || {};
			options.duration = options.duration || 24*60*60*1000; // One day

			var nagged = helper.getData('nagged');

			if (!nagged) {
				nagged = {
					remindTime: Date.now(),
					registered: false
				}
				helper.storeData('nagged', nagged);
			}

			nag.register = function(registered) {
				if (registered && !nagged.registered) {
					nagged = {
						remindTime: Date.now(),
						registered: true
					};
					helper.storeData('nagged', nagged);
				}
				return nagged;
			}

			if (pokki.isAppRunning()) {
				helper.setBadge();
			} else if (!nagged.registered && Date.now() - nagged.remindTime >= options.duration) {
				pokki.notify(options.message);
				helper.setBadge(1);
				helper.storeData('nagged', {remindTime: Date.now(), hasReg: false});
			}

			return nag;
		}

		helper.storeData = function() {
			// pokkiHelper.storeData({foo:'bar'})
			// pokkiHelper.storeData('foo','bar')
			// pokkiHelper.storeData({foo:'bar'}, '_pokkiApp_etc');
			var args = Array.prototype.slice.call(arguments);
			var data, ns;
			if (typeof args[0] === 'string') {
				data = {};
				var key = args.shift();
				data[key] = args.shift();
			} else {
				data = args.shift();
			}
			ns = args.shift() || '_pokkiApp_var';

			var values = extend(helper.getData(null,ns), data||{});
			// limit is around 2.4Mb (2.6M chars)
			localStorage[ns] = JSON.stringify(values);
		}

		helper.getData = function(attr,ns) {
			ns || (ns='_pokkiApp_var');
			var data = localStorage[ns] ? JSON.parse(localStorage[ns]) : {};
			if (typeof attr === 'string') return data[attr];
			return data;
		}

		helper.setBadge = function(val,doIncr) {
			val = parseInt(val,10)||0;
			if (doIncr) {
				if (doIncr==='decr') val = val * -1;
				val += (parseInt(helper.getData('badge','_pokkiApp_etc'),10)||0);
			}
			if (val<0) val=0;
			helper.storeData({'badge':val},'_pokkiApp_etc');
			if (!val) return pokki.removeIconBadge();
			if (val > 999) val = (val % 1000) || 1; //last 3 digits (or 1 if == 1000*N), basically 1-999 cycle
			pokki.setIconBadge(val);
		}

		helper.loadAsyncFile = function(file, onSuccess, onError) {
			var request = new XMLHttpRequest();

			request.onload = function(evt) {
				if (onSuccess) {
					onSuccess(request);
				} 
			}

			request.onerror = function(evt) {
				if (onError) {
					onError(evt);
				}
			}

			request.open("get", file, true);//true is for asynch
			request.send();
		}

		helper.getCountryCode = function(onSuccess, onError) {
			var storedGeo = pokkiHelper.getData('geo');
			var geoTTL = 1000 * 60 * 60 * 24 * 7; // 7 days to live
			var geoExpired = (storedGeo && storedGeo.timeStamp) ? (new Date().getTime()-storedGeo.timeStamp >= geoTTL) : true;
			if (storedGeo && storedGeo.geo && !geoExpired) {
				onSuccess(storedGeo.geo);
			} else {
				//TODO: Bundle this logic with loadAsyncFile
				var req = new XMLHttpRequest();
				req.open('GET', 'http://j.maxmind.com/js/country.js', false);
				req.setRequestHeader('Referer', 'http://www.pokki.com');
				req.onload = function(evt) {
					eval.call(window, req.responseText);
					if (geoip_country_code) {
						var newGeo = geoip_country_code();
						helper.storeData('geo', {geo:newGeo,timeStamp:new Date().getTime()});
						onSuccess(newGeo);
					}
				}
				
				req.onerror = function(evt) {
					if (onError) {
						onError(evt);
					}
				}
				req.send(null);
			}
		}

		helper.getTrackingIdString = function() {
			var clientId;
			var numericAppId;
			if (!!pokki.getPlatformInfo) {
				clientId = JSON.parse(pokki.getPlatformInfo()).tracking.clientId;
			} else {
				console.log('[HELPER ERROR] pokki.getPlatformInfo is not available');
				return '';
			}

			numericAppId = pokki.getScrambled('numeric_app_id');
			if (numericAppId === '') {
				console.log('[HELPER ERROR] Scrambled data missing "numeric_app_id".');
				return '';
			}
			
			return clientId + '---' + numericAppId;
		}

		helper.getPlatformSource = function() {
			var campaign = pokki.getPlatformInstallCampaign();
			var source = pokki.getPlatformInstallSource();
			if (source.match(/oem/)) {
				if (campaign.match(/acer/)) {
					return 'acer';
				} else if (campaign.match(/toshiba/)) {
					return 'toshiba';
				} else if (campaign.match(/lenovo/)) {
					return 'lenovo';
				}
				return 'oem';
			} else if (source.match(/ad/)) {
				if (campaign.match(/bt/)) {
					return 'bittorrent';
				} else {
					return 'ad';
				}
			} else if (source.match(/swn/)) {
				return 'opencandy';
			}
			return 'organic';
		}

		helper.enableDefaults = function() {
			this.backgroundAutoShutdown();
			this.setWindowConstraints();
			this.saveWindowState(true);
			pokki.setWindowFeature('maximize', true);
		}

		helper.getWindowPrefs = function() {
			return windowPrefs;
		}

		return helper;
	})();
} else {
	console.error("Pokki not available! Are you on the Pokki platform?");
}