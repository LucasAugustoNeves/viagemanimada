let map;
let geocoder;
let directionsService;
// let directionsRenderer; // Main renderer is not used for multi-segment display

// Animation state variables
let animatedMarker = null;
let currentSegmentIndex = 0;
let currentPathStep = 0;
let animationFrameId = null;


const travelModesDefinition = [
    { text: 'Car 🚙', value: 'DRIVING', apiMode: google.maps.TravelMode.DRIVING, emoji: '🚙', color: '#FF0000' }, // Red
    { text: 'Motorcycle 🏍️', value: 'DRIVING_MOTORCYCLE', apiMode: google.maps.TravelMode.DRIVING, emoji: '🏍️', color: '#B22222' }, // Firebrick Red
    { text: 'Plane 🛩️', value: 'PROXY_PLANE', apiMode: google.maps.TravelMode.DRIVING, emoji: '🛩️', color: '#0000FF' }, // Blue
    { text: 'On Foot 🏃‍♂️', value: 'WALKING', apiMode: google.maps.TravelMode.WALKING, emoji: '🏃‍♂️', color: '#008000' }, // Green
    { text: 'Bicycle 🚲', value: 'BICYCLING', apiMode: google.maps.TravelMode.BICYCLING, emoji: '🚲', color: '#FF8C00' }, // DarkOrange
    { text: 'Scooter 🛴', value: 'PROXY_SCOOTER', apiMode: google.maps.TravelMode.BICYCLING, emoji: '🛴', color: '#FFD700' }, // Gold
    { text: 'Train 🚂', value: 'PROXY_TRAIN', apiMode: google.maps.TravelMode.DRIVING, emoji: '🚂', color: '#800080' },   // Purple
    { text: 'Boat 🚢', value: 'PROXY_BOAT', apiMode: google.maps.TravelMode.DRIVING, emoji: '🚢', color: '#00CED1' }      // DarkTurquoise
];

function populateTravelModeSelect(selectElement) {
    if (!selectElement) return;
    selectElement.innerHTML = '';
    travelModesDefinition.forEach(mode => {
        const option = document.createElement('option');
        option.value = mode.value;
        option.textContent = mode.text;
        selectElement.appendChild(option);
    });
}

function createEmojiIcon(emoji, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.font = (size * 0.8) + 'px sans-serif'; 
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, size / 2, size / 2 + (size * 0.05) );
    return {
        url: canvas.toDataURL(),
        scaledSize: new google.maps.Size(size, size),
        anchor: new google.maps.Point(size / 2, size / 2)
    };
}

function initMap() {
  try {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) { console.error("Map container not found!"); alert("Map display error."); return; }
    mapContainer.innerHTML = ''; 
    map = new google.maps.Map(mapContainer, { center: { lat: 0, lng: 0 }, zoom: 2 });
    console.log("Google Map initialized.");
    geocoder = new google.maps.Geocoder();
    directionsService = new google.maps.DirectionsService();
    // No main directionsRenderer; each segment gets its own.
  } catch (e) {
    console.error("Error during Google Maps initialization:", e);
    alert("Failed to initialize Google Maps. Check API key/internet and refresh.");
  }
}

function geocodeAddress(addressString) {
  return new Promise((resolve, reject) => {
    if (!google || !google.maps || !geocoder) { reject("Map services not ready. Refresh."); return; }
    geocoder.geocode({ 'address': addressString }, (results, status) => {
      if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
        resolve(results[0].geometry.location);
      } else {
        let msg = `Geocoding failed for "${addressString}".`;
        if (status === google.maps.GeocoderStatus.ZERO_RESULTS) msg = `Could not find: "${addressString}".`;
        else msg += ` Error: ${status}`;
        reject(msg);
      }
    });
  });
}

function animateMarker(allSegmentResults) {
    currentSegmentIndex = 0;
    currentPathStep = 0;

    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (animatedMarker) animatedMarker.setMap(null); 
    animatedMarker = null; 

    if (!allSegmentResults || allSegmentResults.length === 0) {
        console.log("No segments to animate.");
        return;
    }

    const getModeDetails = (modeValue) => travelModesDefinition.find(m => m.value === modeValue);

    function animateCurrentSegment() {
        if (currentSegmentIndex >= allSegmentResults.length) {
            console.log("All segments animated.");
            return; 
        }

        const segment = allSegmentResults[currentSegmentIndex];
        if (!segment.routeData || !segment.routeData.routes || segment.routeData.routes.length === 0) {
            console.warn(`No route data for segment ${currentSegmentIndex + 1}. Skipping.`);
            currentSegmentIndex++; currentPathStep = 0;
            animationFrameId = requestAnimationFrame(animateCurrentSegment); return;
        }
        const route = segment.routeData.routes[0];
        const path = route.overview_path;
        if (!path || path.length === 0) {
            console.warn(`No path for segment ${currentSegmentIndex + 1}. Skipping.`);
            currentSegmentIndex++; currentPathStep = 0;
            animationFrameId = requestAnimationFrame(animateCurrentSegment); return;
        }

        const modeDetails = getModeDetails(segment.originalMode);
        const emoji = modeDetails ? modeDetails.emoji : '❓'; 
        const emojiIconSize = 32;

        if (!animatedMarker) {
            animatedMarker = new google.maps.Marker({ map: map });
        }
        
        // Update icon only if it changes for the new segment or if it's the first step of a segment
        if (currentPathStep === 0) {
             animatedMarker.setIcon(createEmojiIcon(emoji, emojiIconSize));
        }

        if (currentPathStep < path.length) {
            animatedMarker.setPosition(path[currentPathStep]);
            // map.panTo(path[currentPathStep]); // Panning disabled as per requirement
            currentPathStep++;
            animationFrameId = requestAnimationFrame(animateCurrentSegment); 
        } else {
            currentSegmentIndex++;
            currentPathStep = 0; 
            if (currentSegmentIndex < allSegmentResults.length) {
                console.log(`Starting animation for segment ${currentSegmentIndex + 1} using ${allSegmentResults[currentSegmentIndex].originalMode}`);
            }
            animationFrameId = requestAnimationFrame(animateCurrentSegment); 
        }
    }
    console.log(`Starting animation for segment 1 using ${allSegmentResults[0].originalMode}`);
    animateCurrentSegment(); 
}


async function calculateMultiSegmentRoute(points, segmentTravelModes) {
    if (!geocoder || !directionsService ) { 
        throw new Error("Core map services not ready.");
    }
    const segmentResults = []; 

    if (map.segmentRenderers && Array.isArray(map.segmentRenderers)) {
        map.segmentRenderers.forEach(renderer => renderer.setMap(null));
    }
    map.segmentRenderers = []; 

    for (let i = 0; i < points.length - 1; i++) {
        const segmentOriginAddress = points[i];
        const segmentDestinationAddress = points[i+1];
        const modeValue = segmentTravelModes[i];
        const modeDefinition = travelModesDefinition.find(m => m.value === modeValue) || 
                               travelModesDefinition.find(m => m.value === 'DRIVING'); // Fallback
        
        const apiTravelMode = modeDefinition.apiMode;
        const segmentColor = modeDefinition.color || '#000000'; // Fallback color black

        try {
            console.log(`Routing segment ${i+1}/${points.length -1}: "${segmentOriginAddress}" to "${segmentDestinationAddress}" via ${modeValue} (API: ${apiTravelMode}, Color: ${segmentColor})`);
            const originLatLng = await geocodeAddress(segmentOriginAddress);
            const destLatLng = await geocodeAddress(segmentDestinationAddress);
            const request = { origin: originLatLng, destination: destLatLng, travelMode: apiTravelMode };

            const result = await new Promise((resolve, reject) => {
                directionsService.route(request, (res, status) => {
                    if (status === google.maps.DirectionsStatus.OK) resolve(res);
                    else reject(`Directions API error for segment ("${segmentOriginAddress}" to "${segmentDestinationAddress}"): ${status}`);
                });
            });
            
            segmentResults.push({ routeData: result, originalMode: modeValue });
            
            const segmentRenderer = new google.maps.DirectionsRenderer({
                map: map,
                directions: result,
                preserveViewport: true, 
                polylineOptions: { 
                    strokeColor: segmentColor,
                    strokeWeight: 5 // Make lines a bit thicker for better visibility
                }
            });
            map.segmentRenderers.push(segmentRenderer);

        } catch (error) {
            console.error("Error in segment routing:", error);
            throw new Error(`Failed for segment ${i+1} ("${segmentOriginAddress}" to "${segmentDestinationAddress}"): ${error.message || error}`);
        }
    }
    
    if (segmentResults.length > 0) {
        const overallBounds = new google.maps.LatLngBounds();
        segmentResults.forEach(res => {
            if (res.routeData && res.routeData.routes && res.routeData.routes[0] && res.routeData.routes[0].overview_path) {
                // Extend bounds with each point in the overview_path for a more precise fit
                res.routeData.routes[0].overview_path.forEach(pt => overallBounds.extend(pt));
            }
        });
        if (!overallBounds.isEmpty()) {
             map.fitBounds(overallBounds);
        } else {
            console.warn("Could not determine overall bounds to fit map.");
        }
    }
    return segmentResults;
}

document.addEventListener('DOMContentLoaded', function() {
    initMap(); 

    const originTravelModeSelect = document.getElementById('origin-travel-mode');
    if (originTravelModeSelect) populateTravelModeSelect(originTravelModeSelect);
    
    let elems = document.querySelectorAll('select');
    M.FormSelect.init(elems);

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

            const inputWrapper = document.createElement('div');
            inputWrapper.classList.add('input-field'); 
            inputWrapper.style.flexGrow = '1';
            inputWrapper.style.marginRight = '10px';
            const newInput = document.createElement('input');
            newInput.type = 'text';
            newInput.classList.add('waypoint-input', 'validate'); 
            newInput.placeholder = `Stopover ${waypointCounter} Location`;
            inputWrapper.appendChild(newInput);
            waypointDiv.appendChild(inputWrapper);

            const travelModeSelectWrapper = document.createElement('div');
            travelModeSelectWrapper.classList.add('input-field');
            travelModeSelectWrapper.style.width = '200px';
            travelModeSelectWrapper.style.marginRight = '10px';
            const newTravelModeSelect = document.createElement('select');
            newTravelModeSelect.classList.add('waypoint-travel-mode');
            populateTravelModeSelect(newTravelModeSelect);
            travelModeSelectWrapper.appendChild(newTravelModeSelect);
            waypointDiv.appendChild(travelModeSelectWrapper);
            M.FormSelect.init(newTravelModeSelect);

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button'; 
            removeBtn.classList.add('btn-floating', 'btn-small', 'red', 'waves-effect', 'waves-light');
            const removeIcon = document.createElement('i');
            removeIcon.classList.add('material-icons');
            removeIcon.textContent = 'remove';
            removeBtn.appendChild(removeIcon);
            removeBtn.addEventListener('click', function() { waypointDiv.remove(); });
            waypointDiv.appendChild(removeBtn);
            
            waypointsContainer.appendChild(waypointDiv);
        });
    }

    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) {
        generateBtn.addEventListener('click', async function() {
            if (!google || !google.maps || !map) { alert("Map not ready. Please wait or refresh."); return; }
            
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (animatedMarker) animatedMarker.setMap(null); 
            if (map.segmentRenderers && Array.isArray(map.segmentRenderers)) {
                map.segmentRenderers.forEach(renderer => renderer.setMap(null));
            }
            map.segmentRenderers = [];

            const originAddress = document.getElementById('origin-input').value;
            const destinationAddress = document.getElementById('destination-input').value;
            
            if (!originAddress) { alert("Please enter an origin."); return; }
            if (!destinationAddress) { alert("Please enter a destination."); return; }

            const allPoints = [originAddress];
            const waypointElements = document.querySelectorAll('.waypoint-entry');
            waypointElements.forEach(wpElement => {
                const input = wpElement.querySelector('.waypoint-input');
                if (input && input.value.trim() !== '') {
                    allPoints.push(input.value.trim());
                }
            });
            allPoints.push(destinationAddress);

            const allSegmentModes = [];
            if (originTravelModeSelect) allSegmentModes.push(originTravelModeSelect.value);
            else allSegmentModes.push('DRIVING'); 

            waypointElements.forEach(wpElement => {
                const input = wpElement.querySelector('.waypoint-input');
                if (input && input.value.trim() !== '') {
                    const modeSelect = wpElement.querySelector('.waypoint-travel-mode');
                    if (modeSelect) allSegmentModes.push(modeSelect.value);
                    else allSegmentModes.push('DRIVING'); 
                }
            });
            
            if (allPoints.length < 2) { alert("Need at least origin and destination."); return; }
            if (allSegmentModes.length !== allPoints.length - 1) {
                alert("Point and mode mismatch. Check inputs."); return;
            }

            console.log("Starting route generation with Points:", allPoints, "Modes:", allSegmentModes);
            try {
                const allSegmentResults = await calculateMultiSegmentRoute(allPoints, allSegmentModes);
                console.log("All segment results:", allSegmentResults);
                if (allSegmentResults.length > 0) {
                    animateMarker(allSegmentResults); 
                } else {
                    alert("No segments were successfully routed.");
                }
            } catch (error) { 
                console.error("Error during multi-segment routing process:", error);
                alert(`Routing process failed: ${error.message || error}`); 
            }
        });
    } else {
        console.error("Generate button not found!");
    }
});
