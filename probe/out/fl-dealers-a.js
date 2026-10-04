"use strict";
(self["webpackChunkfreightliner"] = self["webpackChunkfreightliner"] || []).push([["scripts_components_dealers_js"],{

/***/ "./scripts/components/dealers.js":
/*!***************************************!*\
  !*** ./scripts/components/dealers.js ***!
  \***************************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _utils_htm__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../utils/htm */ "./scripts/utils/htm.js");
/* harmony import */ var _utils_http__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../utils/http */ "./scripts/utils/http.js");
/* harmony import */ var _constants__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../constants */ "./scripts/constants.js");
/* harmony import */ var _googlemaps_markerwithlabel__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @googlemaps/markerwithlabel */ "./node_modules/@googlemaps/markerwithlabel/dist/index.esm.js");
/* harmony import */ var _utils_domWrap__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../utils/domWrap */ "./scripts/utils/domWrap.js");
/* harmony import */ var _utils_titleCase__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../utils/titleCase */ "./scripts/utils/titleCase.js");
/* harmony import */ var _utils_dealerExtendAddress__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../utils/dealerExtendAddress */ "./scripts/utils/dealerExtendAddress.js");
/* harmony import */ var _utils_getDistance__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../utils/getDistance */ "./scripts/utils/getDistance.js");
/* harmony import */ var _utils_strDefaults__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../utils/strDefaults */ "./scripts/utils/strDefaults.js");
/* harmony import */ var _utils_getParameterByName__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ../utils/getParameterByName */ "./scripts/utils/getParameterByName.js");
/* harmony import */ var _utils_dateTimeService__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ../utils/dateTimeService */ "./scripts/utils/dateTimeService.js");
/* harmony import */ var mustache__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! mustache */ "./node_modules/mustache/mustache.mjs");












const filtersFromUrl = (0,_utils_strDefaults__WEBPACK_IMPORTED_MODULE_8__.default)((0,_utils_getParameterByName__WEBPACK_IMPORTED_MODULE_9__.default)('f')),
      filters = [{
  key: 'Sales',
  label: 'Sales',
  description: 'Location provides truck sales',
  fnFilter: filterContains
}, {
  key: 'Parts',
  label: 'Parts',
  description: 'Location provides parts sales and warranty',
  fnFilter: filterContains
}, {
  key: 'Service',
  label: 'Service',
  description: 'Location provides truck service and warranty',
  fnFilter: filterContains
}, {
  key: 'EliteSupport',
  label: 'Elite Support',
  description: 'Location is Elite Certified and provides rapid diagnosis, mission critical parts inventory and meets several high operational performance standards. <a href="/service/elite-support/">View more details about Elite Support locations</a>',
  fnFilter: (property, location) => {
    return location.eliteSupport === true;
  }
}, {
  key: 'isECertified',
  label: 'eCertified',
  description: 'Location is eCertified and has met required criteria to seamlessly support customer\'s Battery Electric Vehicle (BEV) needs across all departments within the dealership.',
  fnFilter: (property, location) => {
    return location.isECertified === true;
  }
}, {
  key: 'isExpressPoint',
  label: 'ExpressPoint',
  description: 'Location provides ExpressPoint services; available at select Love\'s and Speedco locations. <a href="/service/expresspoint/">View more details about ExpressPoint</a>',
  fnFilter: (property, location) => {
    return location.isExpressPoint === true;
  }
}, {
  key: 'IsBodyShop',
  label: 'Body Shop',
  description: 'Location provides body shop service',
  fnFilter: (property, location) => {
    return location.isBodyShop === true;
  }
}].map(function (item) {
  return {
    key: item.key,
    label: item.label,
    html: (0,_utils_htm__WEBPACK_IMPORTED_MODULE_0__.default)('div class="filter" data-filter="' + item.key + '"', (0,_utils_htm__WEBPACK_IMPORTED_MODULE_0__.default)('span', item.label)) + '',
    description: (0,_utils_htm__WEBPACK_IMPORTED_MODULE_0__.default)('div', (0,_utils_htm__WEBPACK_IMPORTED_MODULE_0__.default)('label class="tw-filter-label"', item.label)('div', item.description)) + '',
    selected: filtersFromUrl[item.key] || false,
    fnFilter: item.fnFilter
  };
}),
      departmentsList = ['Sales', 'Parts', 'Service'],
      weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      currentDay = new Date().getDay(),
      dayOfWeek = weekDays.find((item, index) => {
  return index === currentDay;
});
/* harmony default export */ __webpack_exports__["default"] = (async container => {
  // 'comp-dealers'
  const {
    default: _
  } = await __webpack_require__.e(/*! import() */ "vendors-node_modules_lodash_lodash_js").then(__webpack_require__.t.bind(__webpack_require__, /*! lodash */ "./node_modules/lodash/lodash.js", 23)),
        {
    default: MapsLoader
  } = await __webpack_require__.e(/*! import() */ "node_modules_load-google-maps-api_index_js").then(__webpack_require__.t.bind(__webpack_require__, /*! load-google-maps-api */ "./node_modules/load-google-maps-api/index.js", 23)),
        Maps = await MapsLoader({
    v: '3.30',
    key: _constants__WEBPACK_IMPORTED_MODULE_2__.googleMapsKey,
    libraries: ['places']
  }),
        currentDateTime = new Date(),
        utcMinutes = (0,_utils_dateTimeService__WEBPACK_IMPORTED_MODULE_10__.default)(currentDateTime).utcMinutes(),
        dealersElement = (0,_utils_domWrap__WEBPACK_IMPORTED_MODULE_4__.default)(container),
        listContainer = dealersElement.querySelector('[list]'),
        tabs = [];

  let accuracy = 10,
      geo = new Maps.Geocoder(),
      searchApi = container.hasAttribute('searchApi') ? container.getAttribute('searchApi') : _constants__WEBPACK_IMPORTED_MODULE_2__.rootURL + '/umbraco/backoffice/dealers/geo-search',
      currentLocation = {},
      lastZ = 100,
      directionsService = new Maps.DirectionsService(),
      directionsDisplay = new Maps.DirectionsRenderer(),
      pendingCall = getListings().catch(() => {}),
      locations = [],
      map,
      dataCache = {},
      getOptions = function () {
    return {
      zoom: 9,
      mapTypeControl: false,
      streetViewControl: false,
      scrollwheel: false,
      draggable: true,
      styles: _constants__WEBPACK_IMPORTED_MODULE_2__.mapStyles
    };
  };

  dealersElement.querySelector('.filters-container').innerHTML = (0,_utils_htm__WEBPACK_IMPORTED_MODULE_0__.default)('header', (0,_utils_htm__WEBPACK_IMPORTED_MODULE_0__.default)('button class="filters-toggle"', 'Filter by Services')('button class="filters-info-toggle"', ''))('div class="filters-info tw-hidden"', filters.reduce(function (str, cur) {
    return str + cur.description;
  }, ''))('div class="filters"', filters.reduce(function (str, cur) {
    return str + cur.html;
  }, '')).toString();
  filters.forEach(cur => {
    if (cur.selected) {
      var _dealersElement$query;

      (_dealersElement$query = dealersElement.querySelector('.filters > .filter[data-filter="' + cur.key + '"]')) === null || _dealersElement$query === void 0 ? void 0 : _dealersElement$query.classList.add('selected');
    }
  });
  dealersElement.on('click', '.filters-info-toggle', function () {
    dealersElement.querySelector('.filters-info').classList.toggle('expanded');
    this.classList.toggle('active');
  }).on('click', '.filters-toggle', function () {
    if (window.innerWidth < 960) {
      dealersElement.querySelector('.filters').classList.toggle('expanded');
      this.classList.toggle('active');
    }
  }).on('click', '.filters > .filter', function () {
    const key = this.getAttribute('data-filter'),
          item = filters.find(itm => itm.key === key);
    if (this.classList.contains('disabled')) return false;

    if (item.selected) {
      item.selected = false;
      this.classList.remove('selected');
    } else {
      item.selected = true;
      this.classList.add('selected');
    }

    cleanupLocations().then(() => {
      drawLocations({
        container: dealersElement.querySelector('[list]'),
        locations,
        map
      });
      history.replaceState({}, document.title, window.location.origin + window.location.pathname + '?f=' + filters.filter(item => item.selected).map(item => item.key).join(','));
    });
  }).on('click', 'button[search]', search).on('keypress', 'input[name="location"]', function (e) {
    if (e.which == 13) {
      search(e);
    }
  }).on('click', 'button[route]', route).on('keypress', 'input[name="start"], input[name="end"]', function (e) {
    if (e.which == 13) {
      route(e);
    }
  }).on('click', 'button[geo]', function () {
    fillGeo(this.parentNode.querySelector('input[type="text"]')).then(() => {
      (0,_utils_domWrap__WEBPACK_IMPORTED_MODULE_4__.default)(this.closest('[tab]').querySelector('button[search],button[route]')).trigger('click');
    });
  }).on('click', 'div[close]', function () {
    [...document.querySelectorAll('[selected]')].forEach(item => item.innerHTML = '');
  }).on('click', '.expandible .default', function () {
    this.classList.toggle('detail');
    this.closest('.expandible').querySelector('.extended').classList.toggle('expanded');
  }).on('click', 'button.details', function () {
    this.classList.toggle('detail');
    this.closest('.location').querySelector('div.details').classList.toggle('expanded');
  });
  [...dealersElement.querySelectorAll('aside > button')].forEach(button => button.addEventListener('click', () => {
    const center = map.getCenter();
    dealersElement.classList.toggle('fullscreen');
    map.setZoom(getOptions().zoom);
    document.body.classList.toggle('takeover-active');
    Maps.event.trigger(map, 'resize');
    map.setCenter(center);
  }));
  [...dealersElement.querySelectorAll('button[data-toggle]')].forEach(button => {
    const tab = {
      id: button.getAttribute('data-toggle')
    };
    tabs.push(tab);

    button.onclick = () => {
      for (let i = 0, l = tabs.length; i < l; i++) {
        const element = document.getElementById(tabs[i].id);
        element.style.display = tab.id === tabs[i].id ? 'block' : 'none';
      }
    };
  });
  fillGeo(dealersElement.querySelector('input[name="location"],input[name="start"]')).then(() => (0,_utils_domWrap__WEBPACK_IMPORTED_MODULE_4__.default)(dealersElement.querySelector('button[search]')).trigger('click')).catch(() => {});
  [...dealersElement.querySelectorAll('input[name="location"],input[name="start"],input[name="end"]')].forEach(element => {
    new Maps.places.Autocomplete(element, {
      types: ['geocode']
    });
  });

  (() => {
    let trigger = 36,
        fixed = false,
        fixedBottom = false,
        map = (0,_utils_domWrap__WEBPACK_IMPORTED_MODULE_4__.default)(dealersElement.querySelector('.map-spacer')),
        mapHolder = (0,_utils_domWrap__WEBPACK_IMPORTED_MODULE_4__.default)(map.closest('aside')),
        filters = dealersElement.querySelector('.filters-container');

    function scrollCheck() {
      var scrollTop = window.scrollY,
          mapTop = map.offset().top,
          makeFixed = scrollTop + trigger > mapTop,
          makeFixedBottom = mapHolder.offset().top + mapHolder.offsetHeight - window.innerHeight < scrollTop;

      if (makeFixed !== fixed) {
        fixed = makeFixed;
        map.classList.toggle('map-fixed', fixed);
        filters.classList.toggle('map-fixed', fixed);
      }

      if (makeFixedBottom !== fixedBottom) {
        fixedBottom = makeFixedBottom;
        map.classList.toggle('map-fixed-bottom', fixedBottom);
        filters.classList.toggle('map-fixed-bottom', fixedBottom);
      }
    }

    window.addEventListener('scroll', scrollCheck);
    window.addEventListener('resize', scrollCheck);
    scrollCheck();
  })();

  function locationInit(item, index) {
    item.marker = makeMarker(item);

    if (item.marker.getMap() !== map) {
      item.marker.setMap(map);
    }

    item.distance = Math.round((0,_utils_getDistance__WEBPACK_IMPORTED_MODULE_7__.default)(item.latitude, item.longitude, currentLocation.lat(), currentLocation.lng()));
    item.index = index;
    return item;
  }

  function search(e) {
    var _dealersElement$query2;

    var tab = e.target.closest('[tab]'),
        addr = (((_dealersElement$query2 = dealersElement.querySelector('input[name="location"]')) === null || _dealersElement$query2 === void 0 ? void 0 : _dealersElement$query2.value) || '').trim();

    if (addr.length > 1) {
      loading(listContainer);
      geo.geocode({
        'address': addr
      }, (results, status) => {
        if (status === Maps.GeocoderStatus.OK) {
          currentLocation = results[0].geometry.location;
          map = new Maps.Map(dealersElement.querySelector("[map]"), Object.assign({
            center: results[0].geometry.location
          }, getOptions()));
          Maps.event.addListener(map, 'bounds_changed', _.throttle(() => {
            var bounds = map.getBounds(),
                ne = bounds.getNorthEast(),
                sw = bounds.getSouthWest();
            var latBuffer = 0.2,
                lngBuffer = 0.2;
            pendingCall = getListings({
              north: ne.lat() + latBuffer,
              south: sw.lat() - latBuffer,
              east: ne.lng() + lngBuffer,
              west: sw.lng() - lngBuffer
            }, dataCache, searchApi).then(data => {
              cleanupLocations(locations);
              locations = data.map((item, index) => locationInit(item, index));
              drawLocations({
                container: dealersElement.querySelector('[list]'),
                locations,
                map
              });
            }).catch(ex => {
              console.error(ex);
            });
          }, 500, {
            'leading': false
          }));
        } else {
          console.info("Geocode was not successful for the following reason: " + status);
          inputAlert(tab, 'Sorry, we could not find that location.');
        }
      });
    } else {
      inputAlert(tab, 'Please enter a location to search.');
    }
  }

  function route(e) {
    var _dealersElement$query3, _dealersElement$query4;

    var tab = e.target.closest('[tab]'),
        addrFrom = (((_dealersElement$query3 = dealersElement.querySelector('input[name="start"]')) === null || _dealersElement$query3 === void 0 ? void 0 : _dealersElement$query3.value) || '').trim(),
        addrTo = (((_dealersElement$query4 = dealersElement.querySelector('input[name="end"]')) === null || _dealersElement$query4 === void 0 ? void 0 : _dealersElement$query4.value) || '').trim();

    if (addrFrom.length > 1 && addrTo.length > 1) {
      loading(listContainer);
      directionsService.route({
        origin: addrFrom,
        destination: addrTo,
        travelMode: Maps.TravelMode.DRIVING
      }, function (result, status) {
        var polyCoords;

        if (status == Maps.DirectionsStatus.OK) {
          polyCoords = getPolyCoords(result.routes[0].legs, accuracy / 2 * 28);
          currentLocation = result.routes[0].legs[0].start_location;
          map = new Maps.Map(dealersElement.querySelector("[map]"), getOptions());
          directionsDisplay.setMap(map);
          directionsDisplay.setOptions({
            suppressMarkers: true
          });
          directionsDisplay.setDirections(result);
          Maps.event.addListener(map, 'bounds_changed', _.throttle(function (event) {
            var bounds = map.getBounds(),
                ne = bounds.getNorthEast(),
                sw = bounds.getSouthWest();
            pendingCall = getListings({
              north: ne.lat(),
              south: sw.lat(),
              east: ne.lng(),
              west: sw.lng()
            }, dataCache, searchApi).then(function (data) {
              cleanupLocations(locations);
              locations = data.filter(function (item) {
                return polyCoords.find(function (coord) {
                  return (0,_utils_getDistance__WEBPACK_IMPORTED_MODULE_7__.default)(coord[0], coord[1], item.latitude, item.longitude) < accuracy;
                });
              }).map(locationInit);
              drawLocations({
                container: dealersElement.querySelector('[list]'),
                locations,
                map
              });
            }).catch(() => {});
          }, 500, {
            'leading': false
          }));
        } else {
          console.info("Directions was not successful for the following reason: " + status);
          inputAlert(tab, 'Sorry, we could not find a route based on those locations.');
        }
      });
    } else {
      if (addrFrom.length < 2) {
        inputAlert(tab, 'Please enter a "From" location.');
      }

      if (addrTo.length < 2) {
        inputAlert(tab, 'Please enter a "To" location.');
      }
    }
  }

  function servicesLookup(departments) {
    const collection = {};

    for (let i = 0, l = departments.length; i < l; i++) {
      const key = _.kebabCase(departments[i].type);

      collection[key] = departments[i].type;
    }

    return collection;
  }

  function isOpen(location) {
    const isOpen = departmentsList.find(function (department) {
      const key = department.toLocaleLowerCase();
      const dep = location[key] ? location[key].fields[0] : false;
      const dayKey = dayOfWeek.toLocaleLowerCase();
      if (!dep || dep.schedule[dayKey].status === 'Closed' || dep.schedule[dayKey].openHours.case && dep.schedule[dayKey].openHours.case === 'Closed') return false;
      return dep.schedule[dayKey].openHours.case === 'AllDay' || dep.schedule[dayKey].status === 'AllDay' || dep.schedule[dayKey].openHours.fields.length === 2 && dep.schedule[dayKey].openHours.fields[0] <= utcMinutes && dep.schedule[dayKey].openHours.fields[1] >= utcMinutes;
    });
    return isOpen;
  }

  function getMapListings(listings, selectedFilters, map) {
    const mapListings = [];
    const sortedListings = listings.sort((x, y) => x.distance - y.distance);

    for (let i = 0; i < sortedListings.length; i++) {
      const location = sortedListings[i];
      const visibleIndex = i + 1;
      const {
        mapLink,
        htmlAddress
      } = (0,_utils_dealerExtendAddress__WEBPACK_IMPORTED_MODULE_6__.dealerExtendAddress)(location);
      location.marker.label.set('labelContent', visibleIndex);
      location.marker.label.labelDiv.textContent = visibleIndex;
      location.marker.setMap(map);
      const showFullAddress = htmlAddress.indexOf('<br') > -1;
      const urlName = encodeURIComponent(location.name).toLowerCase().replaceAll('%20', '-').replaceAll("'", '').replaceAll('%27', '');
      const prepend = {
        dealerUrl: `/dealer/${location.code.toLowerCase()}/${urlName}/`,
        htmlAddress,
        isOpen: isOpen(location),
        mapLink,
        showDetails: !location.isInternational,
        showDirections: !location.isInternational,
        showDistance: !location.isInternational,
        showFullAddress,
        showHtmlAddress: !showFullAddress,
        visibleIndex
      };
      const copy = Object.assign(location, prepend);
      mapListings.push(copy);
    }

    return mapListings;
  }

  function populateHeader(count) {
    const listingHeader = container.querySelector('[data-target="[LISTING-HEADER]"]');

    if (listingHeader !== null) {
      let locationSummary = `${count} Location`;
      if (count > 1) locationSummary += 's';
      locationSummary += ' Found';
      listingHeader.innerHTML = locationSummary;
    }
  }

  function populateListings(listings, selectedFilters, map) {
    const template = container.querySelector('[data-target="[LISTINGS]"]');

    if (template !== null) {
      const mapListings = getMapListings(listings, selectedFilters, map);
      listContainer.innerHTML = mustache__WEBPACK_IMPORTED_MODULE_11__.default.render(template.innerHTML, {
        listings: mapListings
      });
    }
  }

  function drawLocations({
    container,
    locations,
    map
  }) {
    // clear the map pins
    for (let i = 0, l = locations.length; i < l; i++) locations[i].marker.setMap(null);

    const selectedFilters = filters.filter(x => x.selected);
    const availableFilters = locations.reduce((obj, location) => {
      filters.forEach(filter => {
        if (filter.fnFilter(filter.key, location)) {
          obj[filter.key] = true;
        }
      });
      return obj;
    }, {});
    const filteredLocations = locations.filter(location => {
      return !selectedFilters.find(filter => {
        return !filter.fnFilter(filter.key, location);
      });
    });
    const groupLabels = ['[HEADER]', 'Partner Locations'];
    [...container.querySelectorAll('.filters > .filter')].forEach(btn => btn.classList.toggle('disabled', !availableFilters[btn.getAttribute('data-filter')]));
    populateHeader(filteredLocations.length);
    populateListings(filteredLocations, selectedFilters, map);
    [...container.querySelectorAll('a.view')].forEach(a => a.addEventListener('click', e => {
      if (gtag_report_conversion && typeof gtag_report_conversion === 'function') gtag_report_conversion();
      window.location.href = a.href;
    }));
  }

  function loading(el) {
    el.innerHTML = (0,_utils_htm__WEBPACK_IMPORTED_MODULE_0__.default)('h3', 'Loading...');
  }

  function fillGeo(el) {
    const parent = el.parentNode;

    function cancel() {
      el.classList.remove('loading-location');
      el.removeEventListener('click', cancel);
    }

    if (parent.classList.contains('loading-location')) {
      return new Promise((resolve, reject) => reject());
    }

    return new Promise((resolve, reject) => {
      parent.classList.add('loading-location');
      parent.classList.remove('fallback');
      parent.addEventListener('click', cancel);
      navigator.geolocation.getCurrentPosition(position => {
        if (!parent.classList.contains('loading-location')) {
          return;
        }

        geo.geocode({
          'location': {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
        }, function (results, status) {
          if (!parent.classList.contains('loading-location')) {
            return;
          }

          if (status === Maps.GeocoderStatus.OK) {
            if (results[0]) {
              el.value = results[0].formatted_address;
              resolve();
            } else {
              reject();
              console.info('No results found');
            }
          } else {
            reject();
            console.info('Geocoder failed due to: ' + status);
          }

          parent.classList.remove('fallback');
          parent.classList.remove('loading-location');
          parent.removeEventListener('click', cancel);
        });
      }, PosError => {
        console.log(PosError); //alert('There was an error loading your location. Please search by city, state or zip.');

        geoFallback(el).then(resolve).catch(reject);
        parent.classList.add('fallback');
        parent.removeEventListener('click', cancel);
      }, {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: navigator.userAgent.toLowerCase().indexOf("android") > -1 ? 15000 : 5000
      });
    });
  }

  function geoFallback(el) {
    const parent = el.parentNode;
    return new Promise((resolve, reject) => {
      if (parent.classList.contains('loading-location') || el.value === '') {
        (0,_utils_http__WEBPACK_IMPORTED_MODULE_1__.default)('https://api.ipstack.com/check?access_key=7652d0f71a5071a6044703dc68df0d05&output=json&legacy=1').get().then(data => {
          if (data.city && data.region_code) {
            el.value = data.city + ', ' + data.region_code;
            resolve();
          } else {
            reject();
          }

          parent.classList.remove('loading-location');
        }).catch(() => {
          reject();
          parent.classList.remove('loading-location');
        });
      }
    });
  }

  function makeMarker(item) {
    lastZ += 1;
    let markerOptions = {
      position: new Maps.LatLng(item.latitude, item.longitude),
      title: item.name,
      zIndex: lastZ,
      draggable: false,
      clickable: true,
      labelContent: '',
      labelAnchor: new Maps.Point(-15, -40),
      labelClass: 'marker-label',
      // the CSS class for the label
      labelInBackground: false,
      icon: {
        url: '/images/map-pin.png',
        size: new Maps.Size(42, 68),
        origin: new Maps.Point(0, 0),
        anchor: new Maps.Point(15, 49),
        scaledSize: new Maps.Size(30, 49)
      }
    };
    return new _googlemaps_markerwithlabel__WEBPACK_IMPORTED_MODULE_3__.default(markerOptions);
  }

  function getListings(opt, dataCache, url) {
    return new Promise((resolve, reject) => {
      if (!opt) {
        reject();
        return;
      }

      const hash = hashCode(JSON.stringify(opt));

      if (dataCache[hash]) {
        resolve(dataCache[hash]);
      } else {
        (0,_utils_http__WEBPACK_IMPORTED_MODULE_1__.default)(url).get(opt).then(data => {
          dataCache[hash] = data;
          resolve(data);
        }).catch(reject);
      }
    });
  }
});

function filterBoolean(property, location) {
  return location[property] && location[property] === true;
}

function filterContains(property, location) {
  property = property.toLowerCase();
  const index = location.departments.findIndex(x => x.name.toLowerCase() === property);
  return index > -1;
}

function cleanupLocations(locations = []) {
  return new Promise(resolve => {
    Promise.all(locations.map(location => new Promise(resolve => setTimeout(() => {
      location.marker.setMap(null);
      resolve();
    }, 20)))).then(resolve);
  });
}

function inputAlert(el, message) {
  var mess = (0,_utils_domWrap__WEBPACK_IMPORTED_MODULE_4__.default)((0,_utils_htm__WEBPACK_IMPORTED_MODULE_0__.default)('div class="input-alert"', message).Node);
  el.parentNode.insertBefore(mess, el.nextSibling);
  mess.classList.add('expanded');
  setTimeout(() => {
    mess.classList.remove('expanded');
    setTimeout(() => mess.remove(), 300);
  }, message.split(' ').length * 300);
}

function getPolyCoords(legs, coordAccuracy) {
  var polyCoords = [],
      skippedCoords = 0;
  legs.forEach(function (leg) {
    leg.steps.forEach(function (step) {
      step.path.forEach(function (nextSegment) {
        if (skippedCoords < coordAccuracy) {
          skippedCoords += 1;
        } else {
          polyCoords.push([nextSegment.lat(), nextSegment.lng()]);
          skippedCoords = 0;
        }
      });
    });
  });
  return polyCoords;
}

function hashCode(code) {
  var hash = 0;
  if (code.length == 0) return hash;

  for (var i = 0; i < code.length; i++) {
    var char = code.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return hash;
}

/***/ }),

/***/ "./scripts/constants.js":
/*!******************************!*\
  !*** ./scripts/constants.js ***!
  \******************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "iOS": function() { return /* binding */ iOS; },
/* harmony export */   "rootURL": function() { return /* binding */ rootURL; },
/* harmony export */   "mapURL": function() { return /* binding */ mapURL; },
/* harmony export */   "googleMapsKey": function() { return /* binding */ googleMapsKey; },
/* harmony export */   "mapStyles": function() { return /* binding */ mapStyles; },
/* harmony export */   "jwpKey": function() { return /* binding */ jwpKey; },
/* harmony export */   "jwpPlayerId": function() { return /* binding */ jwpPlayerId; }
/* harmony export */ });
const iOS = navigator.userAgent.match(/(iPad|iPhone|iPod)/g) ? true : false;
const rootURL = window.location.hostname.indexOf('tombrasweb.com') !== -1 ? 'https://freightlinertrucks-dev.azurewebsites.net/umbraco/api' : '/umbraco/api';
const mapURL = iOS ? 'http://maps.apple.com/?daddr=' : 'https://www.google.com/maps/?q=';
const googleMapsKey = 'AIzaSyCbV0POfqng9nd-_XuVDElHEO7Z1roFQXk';
const mapStyles = [{
  featureType: "all",
  stylers: [{
    saturation: -80
  }]
}, {
  featureType: "road.arterial",
  elementType: "geometry",
  stylers: [{
    hue: "#00ffee"
  }, {
    saturation: 50
  }]
}, {
  featureType: "poi.business",
  elementType: "labels",
  stylers: [{
    visibility: "off"
  }]
}];
const jwpKey = 'TtV5iMjD1ORmFr/yZP1lV7lbxWn69lBGpwxo9Pz2IV13Jkn4';
const jwpPlayerId = 'sHGOoMEW';

/***/ }),

/***/ "./scripts/utils/dateTimeService.js":
/*!******************************************!*\
  !*** ./scripts/utils/dateTimeService.js ***!
  \******************************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
function dateTimeService(date) {
  return {
    utcMinutes() {
      const hours = date.getUTCHours();
      const minutes = date.getUTCMinutes();
      return hours * 60 + minutes;
    }

  };
}

/* harmony default export */ __webpack_exports__["default"] = (dateTimeService);

/***/ }),

/***/ "./scripts/utils/dealerExtendAddress.js":
/*!**********************************************!*\
  !*** ./scripts/utils/dealerExtendAddress.js ***!
  \**********************************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "dealerExtendAddress": function() { return /* binding */ dealerExtendAddress; }
/* harmony export */ });
/* harmony import */ var core_js_modules_es_string_replace_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! core-js/modules/es.string.replace.js */ "../node_modules/core-js/modules/es.string.replace.js");
/* harmony import */ var core_js_modules_es_string_replace_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(core_js_modules_es_string_replace_js__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _constants__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../constants */ "./scripts/constants.js");
/* harmony import */ var _titleCase__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./titleCase */ "./scripts/utils/titleCase.js");



function dealerExtendAddress(dealer) {
  let mapLinkAddress = dealer.address.replace('\n', '<br />'),
      htmlAddress = (0,_titleCase__WEBPACK_IMPORTED_MODULE_2__.titleCase)(mapLinkAddress),
      {
    city,
    state,
    country,
    isInternational,
    zip
  } = dealer;

  if (city && city !== '') {
    mapLinkAddress += ', ' + city;
    htmlAddress += '<br>' + (0,_titleCase__WEBPACK_IMPORTED_MODULE_2__.titleCase)(city);
  }

  if (state && state !== '') {
    mapLinkAddress += ', ' + state;
    htmlAddress += ', ' + (0,_titleCase__WEBPACK_IMPORTED_MODULE_2__.titleCase)(state);
  }

  if (country && country !== '' && isInternational) {
    mapLinkAddress += ', ' + country;
    htmlAddress += ', ' + country;
  }

  if (zip && zip !== '') {
    mapLinkAddress += ' ' + zip;
    htmlAddress += ' ' + zip;
  }

  mapLinkAddress = `${mapLinkAddress}, ${city}, ${state}, ${country} ${zip}`;
  mapLinkAddress = `${mapLinkAddress}<br> ${city}, ${state}, ${country} ${zip}`;
  let mapLink = _constants__WEBPACK_IMPORTED_MODULE_1__.mapURL + encodeURIComponent(mapLinkAddress);
  return { ...dealer,
    mapLink,
    htmlAddress
  };
}

/***/ }),

/***/ "./scripts/utils/domWrap.js":
/*!**********************************!*\
  !*** ./scripts/utils/domWrap.js ***!
  \**********************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
const domWrap = element => {
  if (!element) {
    element = document.createElement('div');
    element.empty = true;
  }

  element.store = element.store || {};

  element.on = (action, delegationOrFn, fn) => {
    if (typeof delegationOrFn === 'function') fn = delegationOrFn;
    let delegation = typeof delegationOrFn === 'string' ? delegationOrFn : false;
    if (!fn) return;
    element.addEventListener(action, function (event) {
      for (let target = event.target; target && target != this; target = target.parentNode) {
        // loop parent nodes from the target to the delegation node
        if (!delegation || target.matches(delegation)) {
          fn.call(target, event);
          break;
        }
      }
    }, false);
    return element;
  };

  element.setSelected = (className = 'selected') => {
    var _element$classList;

    [...element.parentNode.childNodes].forEach(node => {
      var _node$classList;

      return (_node$classList = node.classList) === null || _node$classList === void 0 ? void 0 : _node$classList.remove(className);
    });
    (_element$classList = element.classList) === null || _element$classList === void 0 ? void 0 : _element$classList.add(className);
    return element;
  };

  element.trigger = event => {
    element.dispatchEvent(new Event(event, {
      bubbles: true
    }));
    return element;
  };

  element.css = styles => {
    Object.keys(styles).forEach(key => element.style[key] = styles[key]);
    return element;
  };

  element.wrapInner = wrapper => {
    element.appendChild(wrapper);

    while (element.firstChild !== wrapper) {
      wrapper.appendChild(element.firstChild);
    }

    return element;
  };

  element.data = (key, value) => {
    if (value) {
      element.store[key] = value;
      return element;
    } else {
      return element.store[key];
    }
  }, element.offset = () => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX
    };
  }, element.check = {
    get overflowLeft() {
      return overflowHorizontal(element) && element.scrollLeft > 0;
    },

    get overflowRight() {
      return overflowHorizontal(element) && element.scrollWidth - element.scrollLeft > element.offsetWidth;
    }

  };
  return element;
};

function overflowHorizontal(element) {
  return element.scrollWidth - element.offsetWidth > 1;
}

/* harmony default export */ __webpack_exports__["default"] = (domWrap);

/***/ }),

/***/ "./scripts/utils/getDistance.js":
/*!**************************************!*\
  !*** ./scripts/utils/getDistance.js ***!
  \**************************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony default export */ __webpack_exports__["default"] = ((lat1, lon1, lat2, lon2) => {
  let R = 6371,
      // Radius of the earth in km
  dLat = deg2rad(lat2 - lat1),
      // deg2rad below
  dLon = deg2rad(lon2 - lon1),
      a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2),
      c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
      d = R * c; // Distance in km

  return d * 0.621371; // Return miles
});

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

/***/ }),

/***/ "./scripts/utils/getParameterByName.js":
/*!*********************************************!*\
  !*** ./scripts/utils/getParameterByName.js ***!
  \*********************************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony import */ var core_js_modules_es_string_replace_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! core-js/modules/es.string.replace.js */ "../node_modules/core-js/modules/es.string.replace.js");
/* harmony import */ var core_js_modules_es_string_replace_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(core_js_modules_es_string_replace_js__WEBPACK_IMPORTED_MODULE_0__);

/* harmony default export */ __webpack_exports__["default"] = ((name, url = window.location.href) => {
  name = name.replace(/[\[\]]/g, "\\$&");
  const regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, " "));
});

/***/ }),

/***/ "./scripts/utils/htm.js":
/*!******************************!*\
  !*** ./scripts/utils/htm.js ***!
  \******************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
function htm(selector, content) {
  let current = [];

  function self(selector, content) {
    if (typeof selector === 'string' && selector.trim() !== '') {
      current.push(['<', selector, '>', content || '', '</', selector.split(' ')[0], '>'].join(''));
    }

    return self;
  }

  self.toString = () => current.join('');

  Object.defineProperty(self, 'Nodes', {
    get() {
      let template = document.createElement('div');
      template.innerHTML = self.toString();
      return template.childNodes;
    }

  });
  Object.defineProperty(self, 'Node', {
    get() {
      return this.Nodes.length === 1 ? this.Nodes[0] : document.createRange().createContextualFragment(self.toString());
    }

  });
  return self(selector, content);
}

/* harmony default export */ __webpack_exports__["default"] = (htm);

/***/ }),

/***/ "./scripts/utils/http.js":
/*!*******************************!*\
  !*** ./scripts/utils/http.js ***!
  \*******************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony import */ var core_js_modules_web_url_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! core-js/modules/web.url.js */ "../node_modules/core-js/modules/web.url.js");
/* harmony import */ var core_js_modules_web_url_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(core_js_modules_web_url_js__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _constants__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../constants */ "./scripts/constants.js");



function request({
  method,
  url,
  data,
  headers
}) {
  return new Promise((resolve, reject) => {
    var xhr = new XMLHttpRequest();

    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(response());
      } else {
        error();
      }
    };

    xhr.onerror = xhr.onabort = error;

    function error() {
      reject(response() || {
        ExceptionMessage: 'Cannot connect to server, please try again in a few minutes.'
      });
    }

    function response() {
      return typeof xhr.response === 'string' ? JSON.parse(xhr.response) : xhr.response;
    }

    xhr.open(method, (url.indexOf('.json') === -1 && url.indexOf('https://') === -1 && url.indexOf('localhost') === -1 ? _constants__WEBPACK_IMPORTED_MODULE_1__.rootURL : '') + url + (method === 'GET' && !!data ? '?' + Object.keys(data).map(key => `${key}=${encodeURIComponent(data[key])}`).join('&') : ''));
    xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
    if (headers) for (let x in headers) xhr.setRequestHeader(x, headers[x]);

    if (method === 'POST') {
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
    }

    xhr.responseType = 'json';
    xhr.send(data ? method === 'POST' ? data : JSON.stringify(data) : undefined);
  });
}

function getScript(source) {
  return new Promise(resolve => {
    const script = document.createElement('script');
    script.async = true;

    script.onload = script.onreadystatechange = (_, isAbort) => {
      if (isAbort || !script.readyState || /loaded|complete/.test(script.readyState)) {
        script.onload = script.onreadystatechange = null;
        script.remove();
        if (!isAbort) resolve();
      }
    };

    script.src = source;
    document.head.appendChild(script);
  });
}

;

function http(url) {
  return {
    get(data) {
      return request({
        method: 'GET',
        url,
        data
      });
    },

    create(data, headers) {
      if (typeof data === 'object') {
        data = new URLSearchParams(data).toString();
      }

      return request({
        method: 'POST',
        url,
        data,
        headers
      });
    },

    script() {
      return getScript(url);
    }

  };
}

/* harmony default export */ __webpack_exports__["default"] = (http);

/***/ }),

/***/ "./scripts/utils/strDefaults.js":
/*!**************************************!*\
  !*** ./scripts/utils/strDefaults.js ***!
  \**************************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony default export */ __webpack_exports__["default"] = (str => (str || '').split(',').reduce((obj, key) => {
  obj[key] = true;
  return obj;
}, {}));

/***/ }),

/***/ "./scripts/utils/titleCase.js":
/*!************************************!*\
  !*** ./scripts/utils/titleCase.js ***!
  \************************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "titleCase": function() { return /* binding */ titleCase; }
/* harmony export */ });
/* harmony import */ var core_js_modules_es_string_replace_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! core-js/modules/es.string.replace.js */ "../node_modules/core-js/modules/es.string.replace.js");
/* harmony import */ var core_js_modules_es_string_replace_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(core_js_modules_es_string_replace_js__WEBPACK_IMPORTED_MODULE_0__);

function titleCase(str) {
  return [// Uppercase words
  'Id', 'Tv', 'LLC', 'Tag', '[a-z]{1}'].reduce((ns, upper) => ns.replace(new RegExp('\\b' + upper + '\\b', 'ig'), (m, loc, orig) => {
    return orig[loc - 1] === "'" ? m : m.toUpperCase();
  }), [// Lowercase words
  'A', 'An', 'The', 'And', 'But', 'For', 'Nor', 'At', 'By', 'For', 'From', 'Into', 'Near', 'Of', 'Du', 'En', 'Et', 'On', 'Onto', 'To', 'With'].reduce((ns, lower) => ns.replace(new RegExp('\\s' + lower + '\\s', 'ig'), txt => txt.toLowerCase()), str.replace(/([^\W_]+[^\s-\/]*) */g, txt => txt.length > 2 ? txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase() : txt)));
}

/***/ })

}]);
//# sourceMappingURL=chunk.scripts_components_dealers_js.928d272295ef42271c47.js.map