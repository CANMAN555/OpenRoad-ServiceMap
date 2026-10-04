"use strict";
(self["webpackChunkfreightliner"] = self["webpackChunkfreightliner"] || []).push([["scripts_components_dealerMap_js"],{

/***/ "./scripts/components/dealerMap.js":
/*!*****************************************!*\
  !*** ./scripts/components/dealerMap.js ***!
  \*****************************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _constants__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../constants */ "./scripts/constants.js");

/* harmony default export */ __webpack_exports__["default"] = (async dealerMap => {
  // 'comp-dealer > [map]'
  const {
    default: MapsLoader
  } = await __webpack_require__.e(/*! import() */ "node_modules_load-google-maps-api_index_js").then(__webpack_require__.t.bind(__webpack_require__, /*! load-google-maps-api */ "./node_modules/load-google-maps-api/index.js", 23)),
        Maps = await MapsLoader({
    v: '3.30',
    key: _constants__WEBPACK_IMPORTED_MODULE_0__.googleMapsKey,
    libraries: ['places']
  }),
        geo = new Maps.Geocoder();
  let addr = dealerMap.getAttribute('map'),
      marker;
  geo.geocode({
    'address': addr
  }, (results, status) => {
    if (status == Maps.GeocoderStatus.OK) {
      marker = new Maps.Marker({
        position: results[0].geometry.location,
        animation: Maps.Animation.DROP,
        draggable: false,
        clickable: false,
        map: new Maps.Map(dealerMap, Object.assign({
          center: results[0].geometry.location
        }, {
          zoom: 8,
          // mapTypeControl: false,
          // streetViewControl: false,
          scrollwheel: false,
          draggable: false,
          disableDefaultUI: true,
          disableDoubleClickZoom: true,
          styles: _constants__WEBPACK_IMPORTED_MODULE_0__.mapStyles
        })),
        icon: {
          url: '/images/map-pin.png',
          size: new Maps.Size(42, 68),
          origin: new Maps.Point(0, 0),
          anchor: new Maps.Point(21, 68),
          scaledSize: new Maps.Size(42, 68)
        }
      });
    } else {
      console.info("Geocode was not successful for the following reason: " + status);
    }
  });
});

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

/***/ })

}]);
//# sourceMappingURL=chunk.scripts_components_dealerMap_js.72c1eb9ffebfa77394f5.js.map