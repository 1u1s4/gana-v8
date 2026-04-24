CREATE TABLE IF NOT EXISTS scrape_runs (
  id VARCHAR(64) PRIMARY KEY,
  started_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3) NULL,
  source_count INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL,
  error TEXT NULL,
  metadata JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scraped_pages (
  id VARCHAR(80) PRIMARY KEY,
  run_id VARCHAR(64) NOT NULL,
  url_hash CHAR(64) NOT NULL,
  url TEXT NOT NULL,
  status_code INT NOT NULL,
  content_type VARCHAR(255) NULL,
  title TEXT NULL,
  description TEXT NULL,
  text_sample MEDIUMTEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  fetched_at DATETIME(3) NOT NULL,
  raw_html MEDIUMTEXT NULL,
  metadata JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT scraped_pages_run_id_fk FOREIGN KEY (run_id) REFERENCES scrape_runs(id) ON DELETE CASCADE,
  UNIQUE KEY scraped_pages_run_url_hash_uq (run_id, url_hash),
  KEY scraped_pages_url_hash_idx (url_hash),
  KEY scraped_pages_content_hash_idx (content_hash),
  KEY scraped_pages_fetched_at_idx (fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
