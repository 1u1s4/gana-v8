ALTER TABLE `Task`
  MODIFY `status` ENUM('queued', 'running', 'succeeded', 'failed', 'quarantined', 'cancelled') NOT NULL;
