import React, { useState, useEffect, useCallback } from 'react';

/**
 * TurkeyAddressDropdown - Cascading address dropdown for Turkey (Database-backed)
 * 
 * Hierarchy: Ülke -> İl (City) -> İlçe (County) -> Mahalle (Neighbourhood)
 * NOT: Semt katmanı kaldırıldı, ilçeden direkt mahalleye gidiliyor
 * 
 * @param {Object} props
 * @param {string} props.country - Current country value
 * @param {string} props.city - Current city value (name)
 * @param {string} props.district - Current district/county value (ilçe name) 
 * @param {string} props.neighbourhood - Current neighbourhood value (mahalle name)
 * @param {string} props.postalCode - Current postal code
 * @param {Function} props.onChange - Called with { country, city, district, neighbourhood, postalCode }
 * @param {boolean} props.disabled - Whether inputs are disabled
 * @param {string} props.className - Additional CSS class
 */
export default function TurkeyAddressDropdown({ 
  country = 'Türkiye',
  city = '',
  district = '',
  neighbourhood = '',
  postalCode = '', 
  onChange, 
  disabled = false,
  className = ''
}) {
  // Internal state for IDs and names (to avoid stale closure issues)
  const [selectedCityId, setSelectedCityId] = useState('');
  const [selectedCityName, setSelectedCityName] = useState(city || '');
  const [selectedCountyId, setSelectedCountyId] = useState('');
  const [selectedCountyName, setSelectedCountyName] = useState(district || '');
  const [selectedNeighbourhoodId, setSelectedNeighbourhoodId] = useState('');
  
  // Data states
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [counties, setCounties] = useState([]);
  const [neighbourhoods, setNeighbourhoods] = useState([]);
  
  // Loading states
  const [loading, setLoading] = useState({
    countries: false,
    cities: false,
    counties: false,
    neighbourhoods: false
  });

  // API helper
  const fetchData = useCallback(async (endpoint) => {
    try {
      const response = await fetch(`/api/address${endpoint}`);
      if (!response.ok) throw new Error('API error');
      return await response.json();
    } catch (err) {
      console.error('Address API error:', err);
      return [];
    }
  }, []);

  // Load countries on mount
  useEffect(() => {
    async function loadCountries() {
      setLoading(l => ({ ...l, countries: true }));
      const data = await fetchData('/countries');
      setCountries(data);
      setLoading(l => ({ ...l, countries: false }));
    }
    loadCountries();
  }, [fetchData]);

  // Load cities when component mounts (Turkey default)
  useEffect(() => {
    async function loadCities() {
      if (country !== 'Türkiye') return;
      setLoading(l => ({ ...l, cities: true }));
      const data = await fetchData('/cities?countryId=1');
      setCities(data);
      setLoading(l => ({ ...l, cities: false }));
      
      // If city prop is provided, find and set cityId
      if (city && data.length > 0) {
        const found = data.find(c => c.name === city);
        if (found) {
          setSelectedCityId(String(found.id));
        }
      }
    }
    loadCities();
  }, [country, city, fetchData]);

  // Load counties when city changes
  useEffect(() => {
    async function loadCounties() {
      if (!selectedCityId) {
        setCounties([]);
        return;
      }
      setLoading(l => ({ ...l, counties: true }));
      const data = await fetchData(`/counties/${selectedCityId}`);
      setCounties(data);
      setLoading(l => ({ ...l, counties: false }));
      
      // If district prop is provided, find and set countyId
      if (district && data.length > 0) {
        const found = data.find(c => c.name === district);
        if (found) {
          setSelectedCountyId(String(found.id));
        }
      }
    }
    loadCounties();
  }, [selectedCityId, district, fetchData]);

  // Load neighbourhoods when county changes (direkt ilçeden mahalleye)
  useEffect(() => {
    async function loadNeighbourhoods() {
      if (!selectedCountyId) {
        setNeighbourhoods([]);
        return;
      }
      setLoading(l => ({ ...l, neighbourhoods: true }));
      // İlçeye göre tüm mahalleleri getir
      const data = await fetchData(`/neighbourhoods-by-county/${selectedCountyId}`);
      setNeighbourhoods(data);
      setLoading(l => ({ ...l, neighbourhoods: false }));
      
      // If neighbourhood prop is provided, find and set neighbourhoodId
      if (neighbourhood && data.length > 0) {
        const found = data.find(n => n.name === neighbourhood);
        if (found) {
          setSelectedNeighbourhoodId(String(found.id));
        }
      }
    }
    loadNeighbourhoods();
  }, [selectedCountyId, neighbourhood, fetchData]);

  // Handle country change
  function handleCountryChange(newCountry) {
    setSelectedCityId('');
    setSelectedCountyId('');
    setSelectedNeighbourhoodId('');
    onChange({
      country: newCountry,
      city: '',
      district: '',
      neighbourhood: '',
      postalCode: ''
    });
  }

  // Handle city change
  function handleCityChange(selectedId) {
    const selected = cities.find(c => String(c.id) === String(selectedId));
    const cityName = selected?.name || '';
    
    // Update local state
    setSelectedCityId(selectedId);
    setSelectedCityName(cityName);
    setSelectedCountyId('');
    setSelectedCountyName('');
    setSelectedNeighbourhoodId('');
    
    // Send to parent
    onChange({
      country,
      city: cityName,
      district: '',
      neighbourhood: '',
      postalCode: ''
    });
  }

  // Handle county change (ilçe)
  function handleCountyChange(selectedId) {
    const selectedCounty = counties.find(c => String(c.id) === String(selectedId));
    const countyName = selectedCounty?.name || '';
    
    // Get city name from current selection (use cities array, not state)
    const selectedCity = cities.find(c => String(c.id) === String(selectedCityId));
    const cityName = selectedCity?.name || '';
    
    // Update local state
    setSelectedCountyId(selectedId);
    setSelectedCountyName(countyName);
    setSelectedNeighbourhoodId('');
    
    // Send to parent - district = ilçe adı
    onChange({
      country,
      city: cityName,
      district: countyName,
      neighbourhood: '',
      postalCode: ''
    });
  }

  // Handle neighbourhood change (mahalle) - sets postal code automatically
  function handleNeighbourhoodChange(selectedId) {
    const selectedNeighbourhood = neighbourhoods.find(n => String(n.id) === String(selectedId));
    const neighbourhoodName = selectedNeighbourhood?.name || '';
    const newPostalCode = selectedNeighbourhood?.post_code || '';
    
    // Get city and county names from arrays (not state - to avoid stale closure)
    const selectedCity = cities.find(c => String(c.id) === String(selectedCityId));
    const cityName = selectedCity?.name || '';
    
    const selectedCounty = counties.find(c => String(c.id) === String(selectedCountyId));
    const countyName = selectedCounty?.name || '';
    
    // Update local state
    setSelectedNeighbourhoodId(selectedId);
    
    // Send to parent
    onChange({
      country,
      city: cityName,
      district: countyName,
      neighbourhood: neighbourhoodName,
      postalCode: newPostalCode
    });
  }

  // Handle postal code change (manual override)
  function handlePostalCodeChange(newPostalCode) {
    onChange({
      country,
      city,
      district,
      neighbourhood,
      postalCode: newPostalCode
    });
  }

  // Handle free text city change (for non-Turkey)
  function handleFreeCityChange(newCity) {
    onChange({
      country,
      city: newCity,
      district: '',
      neighbourhood: '',
      postalCode
    });
  }

  const isTurkey = country === 'Türkiye';
  const inputClass = `form-control ${disabled ? 'readonly' : ''} ${className}`;
  const selectClass = `form-control ${disabled ? 'readonly' : ''} ${className}`;

  return React.createElement('div', { className: 'turkey-address-dropdown' },
    // Country Select
    React.createElement('div', { className: 'form-row', style: { marginBottom: '12px' } },
      React.createElement('div', { className: 'form-group', style: { flex: 1 } },
        React.createElement('label', { className: 'form-label' }, 'Ülke'),
        React.createElement('select', {
          value: country,
          onChange: (e) => handleCountryChange(e.target.value),
          disabled: disabled,
          className: selectClass
        },
          React.createElement('option', { value: 'Türkiye' }, 'Türkiye'),
          countries.filter(c => c.name !== 'TURKEY' && c.name !== 'Türkiye').map(c => 
            React.createElement('option', { key: c.id, value: c.name }, c.name)
          )
        )
      )
    ),

    // City & County (for Turkey) - Row 1
    isTurkey ? React.createElement('div', { className: 'form-row', style: { marginBottom: '12px', gap: '12px', display: 'flex' } },
      // City Dropdown (İl)
      React.createElement('div', { className: 'form-group', style: { flex: 1 } },
        React.createElement('label', { className: 'form-label' }, 'İl'),
        React.createElement('select', {
          value: selectedCityId,
          onChange: (e) => handleCityChange(e.target.value),
          disabled: disabled || loading.cities,
          className: selectClass
        },
          React.createElement('option', { value: '' }, 
            loading.cities ? 'Yükleniyor...' : 'İl seçin...'
          ),
          cities.map(c => 
            React.createElement('option', { key: c.id, value: c.id }, c.name)
          )
        )
      ),
      
      // County Dropdown (İlçe)
      React.createElement('div', { className: 'form-group', style: { flex: 1 } },
        React.createElement('label', { className: 'form-label' }, 'İlçe'),
        React.createElement('select', {
          value: selectedCountyId,
          onChange: (e) => handleCountyChange(e.target.value),
          disabled: disabled || !selectedCityId || loading.counties,
          className: selectClass
        },
          React.createElement('option', { value: '' }, 
            loading.counties ? 'Yükleniyor...' : !selectedCityId ? 'Önce il seçin' : 'İlçe seçin...'
          ),
          counties.map(c => 
            React.createElement('option', { key: c.id, value: c.id }, c.name)
          )
        )
      )
    ) : 
    // City Input (for other countries)
    React.createElement('div', { className: 'form-row', style: { marginBottom: '12px' } },
      React.createElement('div', { className: 'form-group', style: { flex: 1 } },
        React.createElement('label', { className: 'form-label' }, 'Şehir'),
        React.createElement('input', {
          type: 'text',
          value: city,
          onChange: (e) => handleFreeCityChange(e.target.value),
          disabled: disabled,
          className: inputClass,
          placeholder: 'Şehir adı girin'
        })
      )
    ),

    // Mahalle & Posta Kodu (for Turkey) - Row 2
    isTurkey && React.createElement('div', { className: 'form-row', style: { marginBottom: '12px', gap: '12px', display: 'flex' } },
      // Neighbourhood Dropdown (Mahalle)
      React.createElement('div', { className: 'form-group', style: { flex: 2 } },
        React.createElement('label', { className: 'form-label' }, 'Mahalle'),
        React.createElement('select', {
          value: selectedNeighbourhoodId,
          onChange: (e) => handleNeighbourhoodChange(e.target.value),
          disabled: disabled || !selectedCountyId || loading.neighbourhoods,
          className: selectClass
        },
          React.createElement('option', { value: '' }, 
            loading.neighbourhoods ? 'Yükleniyor...' : !selectedCountyId ? 'Önce ilçe seçin' : 'Mahalle seçin...'
          ),
          neighbourhoods.map(n => 
            React.createElement('option', { key: n.id, value: n.id }, n.name)
          )
        )
      ),
      
      // Postal Code
      React.createElement('div', { className: 'form-group', style: { flex: 1, maxWidth: '150px' } },
        React.createElement('label', { className: 'form-label' }, 'Posta Kodu'),
        React.createElement('input', {
          type: 'text',
          value: postalCode,
          onChange: (e) => handlePostalCodeChange(e.target.value),
          disabled: disabled,
          className: inputClass,
          placeholder: 'Otomatik'
        })
      )
    ),

    // Postal Code for non-Turkey
    !isTurkey && React.createElement('div', { className: 'form-row' },
      React.createElement('div', { className: 'form-group', style: { flex: 1, maxWidth: '200px' } },
        React.createElement('label', { className: 'form-label' }, 'Posta Kodu'),
        React.createElement('input', {
          type: 'text',
          value: postalCode,
          onChange: (e) => handlePostalCodeChange(e.target.value),
          disabled: disabled,
          className: inputClass,
          placeholder: 'Posta kodu'
        })
      )
    )
  );
}
