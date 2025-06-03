let map;
let geocoder;
let directionsService;
let directionsRenderer;
let animatedMarker = null;
let animationTimeout = null; // To control and cancel existing timeouts

// Helper function to create emoji-based map icons
function createEmojiIcon(emoji, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Set font size slightly smaller than canvas to fit, adjust as needed
    ctx.font = (size * 0.8) + 'px sans-serif'; 
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Fill emoji at the center of the canvas
    // The y-position might need slight adjustment depending on the emoji and font
    ctx.fillText(emoji, size / 2, size / 2 + (size * 0.05) ); // Small nudge down for better centering

    return {
        url: canvas.toDataURL(),
        scaledSize: new google.maps.Size(size, size),
        anchor: new google.maps.Point(size / 2, size / 2) // Anchor to the center of the emoji
    };
}

function initMap() {
  try {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) {
      console.error("Map container not found!");
      alert("Error: Map display area not found on the page.");
      return;
    }
    mapContainer.innerHTML = ''; 

    map = new google.maps.Map(mapContainer, {
      center: { lat: 0, lng: 0 },
      zoom: 2,
    });
    console.log("Google Map initialized.");
    
    geocoder = new google.maps.Geocoder();
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer();
    directionsRenderer.setMap(map); 
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
  
  let finalMarkerIcon;
  const emojiIconSize = 32; // Define a consistent size for emoji icons

  if (selectedTransportValue === 'plane') {
      finalMarkerIcon = createEmojiIcon('🛩️', emojiIconSize); // U+FE0F variation selector for explicit emoji
  } else { // Default to car
      finalMarkerIcon = createEmojiIcon('🚙', emojiIconSize);
  }

  animatedMarker = new google.maps.Marker({
    map: map,
    icon: finalMarkerIcon,
    // position will be set by animation loop
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


function calculateAndDisplayRoute(originLatLng, destinationLatLng, waypoints, travelModeString) {
  if (typeof google === 'undefined' || !google.maps || !directionsService || !directionsRenderer || !map) {
    console.error("Directions service not available (Google Maps API, services, or map not loaded).");
    alert("Map services required for routing are not ready. Please try refreshing the page.");
    return;
  }

  const request = {
    origin: originLatLng,
    destination: destinationLatLng,
    waypoints: waypoints, 
    optimizeWaypoints: true, 
    travelMode: google.maps.TravelMode[travelModeString.toUpperCase()] || google.maps.TravelMode.DRIVING
  };

  directionsService.route(request, (result, status) => {
    if (status === google.maps.DirectionsStatus.OK) {
      directionsRenderer.setDirections(result);
      console.log('Route displayed on map with waypoints.');
      if (result.routes && result.routes.length > 0) {
        animateMarker(result.routes[0]);
      } else {
        console.log("No routes found in the result to animate.");
        alert("A route was calculated, but no specific path segments were found to animate.");
      }
    } else {
      let userMessage = "Could not calculate directions.";
      if (status === google.maps.DirectionsStatus.NOT_FOUND) {
        userMessage = "Could not find a route for one or more of the locations (origin, destination, or waypoints). Please check the locations.";
      } else if (status === google.maps.DirectionsStatus.ZERO_RESULTS) {
        userMessage = "No route could be found between the origin, destination, and waypoints.";
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
    
    const addStopBtn = document.getElementById('add-stop-btn');
    const waypointsContainer = document.getElementById('waypoints-container');
    let waypointCounter = 0;

    if (addStopBtn && waypointsContainer) {
        addStopBtn.addEventListener('click', function() {
            waypointCounter++;
            const waypointDiv = document.createElement('div');
            waypointDiv.classList.add('waypoint-entry'); 
            waypointDiv.style.display = 'flex';
            waypointDiv.style.alignItems = 'center';
            waypointDiv.style.marginBottom = '10px'; 

            const newInput = document.createElement('input');
            newInput.type = 'text';
            newInput.classList.add('waypoint-input', 'validate'); 
            newInput.placeholder = `Stopover ${waypointCounter} Location`;
            newInput.style.flexGrow = '1'; 
            newInput.style.marginRight = '10px'; 

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button'; 
            removeBtn.classList.add('btn-floating', 'btn-small', 'red', 'waves-effect', 'waves-light');
            
            const removeIcon = document.createElement('i');
            removeIcon.classList.add('material-icons');
            removeIcon.textContent = 'remove';
            removeBtn.appendChild(removeIcon);

            removeBtn.addEventListener('click', function() {
                waypointDiv.remove();
            });
            
            const inputWrapper = document.createElement('div');
            inputWrapper.classList.add('input-field'); 
            inputWrapper.style.flexGrow = '1';
            inputWrapper.style.marginRight = '10px';
            inputWrapper.appendChild(newInput);

            waypointDiv.appendChild(inputWrapper);
            waypointDiv.appendChild(removeBtn);
            waypointsContainer.appendChild(waypointDiv);
        });
    } else {
        if (!addStopBtn) console.error("Add Stop button ('add-stop-btn') not found!");
        if (!waypointsContainer) console.error("Waypoints container ('waypoints-container') not found!");
    }

    if (generateBtn) {
        generateBtn.addEventListener('click', async function() {
            if (typeof google === 'undefined' || !google.maps) {
                alert("Google Maps API is not loaded. Please check your internet connection or API key setup and refresh.");
                console.error("Google Maps API not available in click listener.");
                return;
            }

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
            
            if (!geocoder || !directionsService || !directionsRenderer || !map) {
                alert("Map services are not fully initialized. Please wait or try refreshing the page.");
                console.error("Core map services not available in click listener.");
                return;
            }

            const waypointInputs = document.querySelectorAll('.waypoint-input');
            const waypoints = [];
            for (let input of waypointInputs) {
                if (input.value.trim() !== '') { 
                    waypoints.push({
                        location: input.value,
                        stopover: true 
                    });
                }
            }

            console.log('Attempting to geocode, find route (with waypoints), and animate...');
            try {
                const originLatLng = await geocodeAddress(origin);
                console.log('Origin Geocoded:', originLatLng.toString());
                
                const destinationLatLng = await geocodeAddress(destination);
                console.log('Destination Geocoded:', destinationLatLng.toString());

                calculateAndDisplayRoute(originLatLng, destinationLatLng, waypoints, transportMode);
                
            } catch (error) { 
                console.error("Error during geocoding process:", error);
                alert(error); 
            }
        });
    } else {
        console.error("Generate button ('generate-btn') not found!");
    }
});
