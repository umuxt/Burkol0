✅ PostgreSQL connection established
-- quotes Schema Backup - 2025-12-04T08:53:09.193Z
-- Before PROMPT-B0 Optimization

-- Table: quotes.customers
CREATE TABLE quotes.customers (
  id INTEGER NOT NULL DEFAULT nextval('quotes.customers_id_seq'::regclass),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  company VARCHAR(255),
  taxOffice VARCHAR(255),
  taxNumber VARCHAR(50),
  address TEXT,
  notes TEXT,
  isActive BOOLEAN DEFAULT true,
  createdAt TIMESTAMP DEFAULT now(),
  updatedAt TIMESTAMP DEFAULT now(),
  website VARCHAR(255),
  fax VARCHAR(50),
  iban VARCHAR(50),
  bankName VARCHAR(255),
  contactPerson VARCHAR(255),
  contactTitle VARCHAR(100),
  country VARCHAR(100) DEFAULT 'Türkiye'::character varying,
  city VARCHAR(100),
  postalCode VARCHAR(20),
  district VARCHAR(100),
  neighbourhood VARCHAR(100)
);

-- Table: quotes.form_templates
CREATE TABLE quotes.form_templates (
  id INTEGER NOT NULL DEFAULT nextval('quotes.form_templates_id_seq'::regclass),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  isActive BOOLEAN DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  createdBy VARCHAR(100),
  createdAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  supersedesId INTEGER
);

-- Table: quotes.form_fields
CREATE TABLE quotes.form_fields (
  id INTEGER NOT NULL DEFAULT nextval('quotes.form_fields_id_seq'::regclass),
  templateId INTEGER NOT NULL,
  fieldCode VARCHAR(100) NOT NULL,
  fieldName VARCHAR(255) NOT NULL,
  fieldType VARCHAR(50) NOT NULL,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  isRequired BOOLEAN DEFAULT false,
  placeholder TEXT,
  helpText TEXT,
  validationRule TEXT,
  defaultValue VARCHAR(255),
  createdAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: quotes.form_field_options
CREATE TABLE quotes.form_field_options (
  id INTEGER NOT NULL DEFAULT nextval('quotes.form_field_options_id_seq'::regclass),
  fieldId INTEGER NOT NULL,
  optionValue VARCHAR(255) NOT NULL,
  optionLabel VARCHAR(255) NOT NULL,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  isActive BOOLEAN DEFAULT true,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  priceValue NUMERIC
);

-- Table: quotes.price_settings
CREATE TABLE quotes.price_settings (
  id INTEGER NOT NULL DEFAULT nextval('quotes.price_settings_id_seq'::regclass),
  code VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  isActive BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,
  createdBy VARCHAR(255),
  createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  supersedesId INTEGER
);

-- Table: quotes.price_parameters
CREATE TABLE quotes.price_parameters (
  id INTEGER NOT NULL DEFAULT nextval('quotes.price_parameters_id_seq'::regclass),
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  fixedValue NUMERIC,
  unit VARCHAR(50),
  description TEXT,
  isActive BOOLEAN DEFAULT true,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  formFieldCode VARCHAR(100),
  settingId INTEGER
);

-- Table: quotes.price_formulas
CREATE TABLE quotes.price_formulas (
  id INTEGER NOT NULL DEFAULT nextval('quotes.price_formulas_id_seq'::regclass),
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  formulaExpression TEXT NOT NULL,
  description TEXT,
  isActive BOOLEAN DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  createdBy VARCHAR(100),
  createdAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  supersedesId INTEGER,
  settingId INTEGER
);

-- Table: quotes.quotes
CREATE TABLE quotes.quotes (
  id VARCHAR(50) NOT NULL,
  customerName VARCHAR(255),
  customerEmail VARCHAR(255),
  customerPhone VARCHAR(50),
  customerCompany VARCHAR(255),
  customerAddress TEXT,
  formTemplateId INTEGER,
  status VARCHAR(50) NOT NULL DEFAULT 'new'::character varying,
  notes TEXT,
  priceFormulaId INTEGER,
  calculatedPrice NUMERIC,
  manualPrice NUMERIC,
  manualPriceReason TEXT,
  finalPrice NUMERIC,
  currency VARCHAR(10) DEFAULT 'TRY'::character varying,
  priceStatus VARCHAR(50) DEFAULT 'current'::character varying,
  priceDifferenceSummary TEXT,
  priceCalculatedAt TIMESTAMPTZ,
  workOrderCode VARCHAR(50),
  approvedAt TIMESTAMPTZ,
  approvedBy VARCHAR(100),
  createdBy VARCHAR(100),
  updatedBy VARCHAR(100),
  createdAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  formTemplateVersion INTEGER,
  priceFormulaVersion INTEGER,
  needsRecalculation BOOLEAN DEFAULT false,
  lastCalculatedAt TIMESTAMPTZ,
  deliveryDate TIMESTAMPTZ,
  isCustomer BOOLEAN DEFAULT false,
  customerId INTEGER
);

-- Table: quotes.quote_form_data
CREATE TABLE quotes.quote_form_data (
  id INTEGER NOT NULL DEFAULT nextval('quotes.quote_form_data_id_seq'::regclass),
  quoteId VARCHAR(50) NOT NULL,
  fieldId INTEGER NOT NULL,
  fieldCode VARCHAR(100) NOT NULL,
  fieldValue TEXT,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: quotes.quote_files
CREATE TABLE quotes.quote_files (
  id INTEGER NOT NULL DEFAULT nextval('quotes.quote_files_id_seq'::regclass),
  quoteId VARCHAR(50) NOT NULL,
  fileType VARCHAR(50) NOT NULL,
  fileName VARCHAR(255) NOT NULL,
  filePath VARCHAR(500) NOT NULL,
  mimeType VARCHAR(100),
  fileSize BIGINT,
  description TEXT,
  uploadedBy VARCHAR(100),
  createdAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Foreign Key Constraints
ALTER TABLE quotes.form_fields ADD CONSTRAINT form_fields_template_id_foreign FOREIGN KEY (templateId) REFERENCES quotes.form_templates(id);
ALTER TABLE quotes.form_field_options ADD CONSTRAINT form_field_options_field_id_foreign FOREIGN KEY (fieldId) REFERENCES quotes.form_fields(id);
ALTER TABLE quotes.quotes ADD CONSTRAINT quotes_form_template_id_foreign FOREIGN KEY (formTemplateId) REFERENCES quotes.form_templates(id);
ALTER TABLE quotes.quotes ADD CONSTRAINT quotes_price_formula_id_foreign FOREIGN KEY (priceFormulaId) REFERENCES quotes.price_formulas(id);
ALTER TABLE quotes.quote_form_data ADD CONSTRAINT quote_form_data_quote_id_foreign FOREIGN KEY (quoteId) REFERENCES quotes.quotes(id);
ALTER TABLE quotes.quote_form_data ADD CONSTRAINT quote_form_data_field_id_foreign FOREIGN KEY (fieldId) REFERENCES quotes.form_fields(id);
ALTER TABLE quotes.quote_files ADD CONSTRAINT quote_files_quote_id_foreign FOREIGN KEY (quoteId) REFERENCES quotes.quotes(id);
ALTER TABLE quotes.form_templates ADD CONSTRAINT form_templates_supersedes_id_foreign FOREIGN KEY (supersedesId) REFERENCES quotes.form_templates(id);
ALTER TABLE quotes.price_formulas ADD CONSTRAINT price_formulas_supersedes_id_foreign FOREIGN KEY (supersedesId) REFERENCES quotes.price_formulas(id);
ALTER TABLE quotes.price_settings ADD CONSTRAINT price_settings_supersedes_id_foreign FOREIGN KEY (supersedesId) REFERENCES quotes.price_settings(id);
ALTER TABLE quotes.price_parameters ADD CONSTRAINT price_parameters_setting_id_foreign FOREIGN KEY (settingId) REFERENCES quotes.price_settings(id);
ALTER TABLE quotes.price_formulas ADD CONSTRAINT price_formulas_setting_id_foreign FOREIGN KEY (settingId) REFERENCES quotes.price_settings(id);
ALTER TABLE quotes.quotes ADD CONSTRAINT fk_quotes_customer FOREIGN KEY (customerId) REFERENCES quotes.customers(id);

