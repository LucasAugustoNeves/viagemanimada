let map;
let geocoder;
let directionsService;
let directionsRenderer;
let animatedMarker = null;
let animationTimeout = null; // To control and cancel existing timeouts

function initMap() {
  try {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) {
      console.error("Map container not found!");
      alert("Error: Map display area not found on the page.");
      return;
    }
    mapContainer.innerHTML = ''; // Clear placeholder text or any previous map instances

    map = new google.maps.Map(mapContainer, {
      center: { lat: 0, lng: 0 },
      zoom: 2,
    });
    console.log("Google Map initialized.");
    
    geocoder = new google.maps.Geocoder();
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer();
    directionsRenderer.setMap(map); // Link renderer to the map
  } catch (e) {
    console.error("Error during Google Maps initialization:", e);
    alert("Failed to initialize Google Maps. Please check your API key and internet connection, then refresh the page.");
  }
}

function geocodeAddress(addressString) {
  return new Promise((resolve, reject) => {
    if (typeof google === 'undefined' || !google.maps || !geocoder) {
      console.error("Geocoding service not available (Google Maps API or Geocoder not loaded).");
      reject("Map services are not ready. Please try refreshing the page.");
      return;
    }
    geocoder.geocode({ 'address': addressString }, (results, status) => {
      if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
        resolve(results[0].geometry.location);
      } else {
        // Provide a more specific error message based on status
        let userMessage = `Geocoding failed for "${addressString}".`;
        if (status === google.maps.GeocoderStatus.ZERO_RESULTS) {
          userMessage = `Could not find location: "${addressString}". Please check the address and try again.`;
        } else {
          userMessage += ` Error: ${status}`;
        }
        console.error(`Geocoding server error for "${addressString}": ${status}`);
        reject(userMessage);
      }
    });
  });
}

function animateMarker(route) {
  if (typeof google === 'undefined' || !google.maps || !map) {
    console.error("Animation cannot proceed: Google Maps API or map object not available.");
    // No alert here as this is an internal function; error logged.
    return;
  }

  if (animationTimeout) {
    clearTimeout(animationTimeout); 
  }
  if (animatedMarker) {
    animatedMarker.setMap(null); 
  }

  const path = route.overview_path;
  if (!path || path.length === 0) {
    console.log("No path found for animation.");
    return;
  }

  const selectedTransportRadio = document.querySelector('input[name="transport-type"]:checked');
  const selectedTransportValue = selectedTransportRadio ? selectedTransportRadio.value : 'car';

  let iconSymbolPath = google.maps.SymbolPath.FORWARD_CLOSED_ARROW;
  let iconFillColor = '#FF0000'; 
  let iconStrokeColor = '#FF0000';

  if (selectedTransportValue === 'plane') {
    iconSymbolPath = 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';
    iconFillColor = '#0000FF'; 
    iconStrokeColor = '#0000FF';
  }

  animatedMarker = new google.maps.Marker({
    map: map,
    icon: {
      path: iconSymbolPath,
      scale: selectedTransportValue === 'plane' ? 0.7 : 5,
      strokeColor: iconStrokeColor,
      strokeWeight: selectedTransportValue === 'plane' ? 1 : 2,
      fillColor: iconFillColor,
      fillOpacity: 1,
      anchor: selectedTransportValue === 'plane' ? new google.maps.Point(10, 10) : new google.maps.Point(0, 2.5)
    }
  });

  let step = 0;
  const animationSpeed = 50; 

  function advance() {
    if (step < path.length) {
      animatedMarker.setPosition(path[step]);
      map.panTo(path[step]); 
      step++;
      animationTimeout = setTimeout(advance, animationSpeed);
    } else {
      console.log("Animation complete.");
    }
  }
  advance();
}


function calculateAndDisplayRoute(originLatLng, destinationLatLng, travelModeString) {
  if (typeof google === 'undefined' || !google.maps || !directionsService || !directionsRenderer || !map) {
    console.error("Directions service not available (Google Maps API, services, or map not loaded).");
    alert("Map services required for routing are not ready. Please try refreshing the page.");
    return;
  }

  const request = {
    origin: originLatLng,
    destination: destinationLatLng,
    travelMode: google.maps.TravelMode[travelModeString.toUpperCase()] || google.maps.TravelMode.DRIVING
  };

  directionsService.route(request, (result, status) => {
    if (status === google.maps.DirectionsStatus.OK) {
      directionsRenderer.setDirections(result);
      console.log('Route displayed on map.');
      if (result.routes && result.routes.length > 0) {
        animateMarker(result.routes[0]);
      } else {
        console.log("No routes found in the result to animate.");
        alert("A route was calculated, but no specific path segments were found to animate.");
      }
    } else {
      let userMessage = "Could not calculate directions.";
      if (status === google.maps.DirectionsStatus.NOT_FOUND) {
        userMessage = "Could not find a route for one or both of the locations. Please check the locations.";
      } else if (status === google.maps.DirectionsStatus.ZERO_RESULTS) {
        userMessage = "No route could be found between the origin and destination.";
      } else {
        userMessage += ` Error: ${status}`;
      }
      alert(userMessage);
      console.error(`Directions request failed due to ${status}`);
    }
  });
}

document.addEventListener('DOMContentLoaded', function() {
    const generateBtn = document.getElementById('generate-btn');
    const originInput = document.getElementById('origin-input');
    const destinationInput = document.getElementById('destination-input');
    const transportTypeCar = document.getElementById('transport-car');

    if (generateBtn) {
        generateBtn.addEventListener('click', async function() {
            // 0. Ensure services are minimally available before trying to clear things
            if (typeof google === 'undefined' || !google.maps) {
                alert("Google Maps API is not loaded. Please check your internet connection or API key setup and refresh.");
                console.error("Google Maps API not available in click listener.");
                return;
            }

            // 1. Clear previous route and animation
            if (directionsRenderer) {
                directionsRenderer.setDirections({routes: []}); 
            }
            if (animatedMarker) {
                animatedMarker.setMap(null); 
            }
            if (animationTimeout) {
                clearTimeout(animationTimeout); 
            }

            const origin = originInput.value;
            const destination = destinationInput.value;
            
            let transportMode = ''; 
            let selectedTransportValue = ''; 

            const transportTypePlaneRadio = document.getElementById('transport-plane');

            if (transportTypeCar.checked) {
                selectedTransportValue = transportTypeCar.value;
                transportMode = 'DRIVING'; 
            } else if (transportTypePlaneRadio && transportTypePlaneRadio.checked) {
                selectedTransportValue = transportTypePlaneRadio.value;
                transportMode = 'DRIVING';
            }

            if (!origin) {
                alert("Please enter an origin location.");
                return;
            }
            if (!destination) {
                alert("Please enter a destination location.");
                return;
            }
            if (!selectedTransportValue) { 
                alert("Please select a mode of transport.");
                return;
            }
            
            // Check for initialized services again before use, in case initMap failed partially
            if (!geocoder || !directionsService || !directionsRenderer || !map) {
                alert("Map services are not fully initialized. Please wait or try refreshing the page.");
                console.error("Core map services (geocoder, directionsService, directionsRenderer, or map) not available in click listener.");
                return;
            }

            console.log('Attempting to geocode, find route, and animate...');
            try {
                const originLatLng = await geocodeAddress(origin);
                console.log('Origin Geocoded:', originLatLng.toString());
                
                const destinationLatLng = await geocodeAddress(destination);
                console.log('Destination Geocoded:', destinationLatLng.toString());

                calculateAndDisplayRoute(originLatLng, destinationLatLng, transportMode);
                
            } catch (error) { // This will catch errors from geocodeAddress (which now include user-friendly messages)
                console.error("Error during geocoding process:", error);
                alert(error); // Display the user-friendly error message from geocodeAddress
            }
        });
    } else {
        console.error("Generate button not found!");
    }
});
