-- =====================================================
-- ADDRESS_DATA SCHEMA
-- Türkiye il, ilçe, semt, mahalle ve posta kodları
-- Kaynak: epigra/tr-geozones (PTT resmi verileri)
-- =====================================================

-- Schema oluştur
CREATE SCHEMA IF NOT EXISTS address_data;

-- =====================================================
-- TABLES
-- =====================================================

-- Ülkeler
CREATE TABLE IF NOT EXISTS address_data.countries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone_code VARCHAR(10),
    is_active BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 999
);

-- İller (Türkiye)
CREATE TABLE IF NOT EXISTS address_data.cities (
    id SERIAL PRIMARY KEY,
    country_id INT NOT NULL DEFAULT 1,
    name VARCHAR(100) NOT NULL
);

-- İlçeler
CREATE TABLE IF NOT EXISTS address_data.counties (
    id SERIAL PRIMARY KEY,
    city_id INT NOT NULL REFERENCES address_data.cities(id),
    name VARCHAR(100) NOT NULL
);

-- Semtler
CREATE TABLE IF NOT EXISTS address_data.districts (
    id SERIAL PRIMARY KEY,
    county_id INT NOT NULL REFERENCES address_data.counties(id),
    name VARCHAR(150) NOT NULL
);

-- Mahalleler (posta kodu dahil)
CREATE TABLE IF NOT EXISTS address_data.neighbourhoods (
    id SERIAL PRIMARY KEY,
    district_id INT NOT NULL REFERENCES address_data.districts(id),
    name VARCHAR(150) NOT NULL,
    post_code VARCHAR(10)
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_cities_country ON address_data.cities(country_id);
CREATE INDEX IF NOT EXISTS idx_counties_city ON address_data.counties(city_id);
CREATE INDEX IF NOT EXISTS idx_districts_county ON address_data.districts(county_id);
CREATE INDEX IF NOT EXISTS idx_neighbourhoods_district ON address_data.neighbourhoods(district_id);
CREATE INDEX IF NOT EXISTS idx_neighbourhoods_postcode ON address_data.neighbourhoods(post_code);

-- Name indexes for search
CREATE INDEX IF NOT EXISTS idx_cities_name ON address_data.cities(name);
CREATE INDEX IF NOT EXISTS idx_counties_name ON address_data.counties(name);
CREATE INDEX IF NOT EXISTS idx_neighbourhoods_name ON address_data.neighbourhoods(name);

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON SCHEMA address_data IS 'Türkiye adres verileri - il, ilçe, semt, mahalle, posta kodu';
COMMENT ON TABLE address_data.countries IS 'Ülkeler listesi';
COMMENT ON TABLE address_data.cities IS 'Türkiye illeri (81 il)';
COMMENT ON TABLE address_data.counties IS 'Türkiye ilçeleri (973 ilçe)';
COMMENT ON TABLE address_data.districts IS 'Semtler (2771 semt)';
COMMENT ON TABLE address_data.neighbourhoods IS 'Mahalleler ve posta kodları (73304 mahalle)';
