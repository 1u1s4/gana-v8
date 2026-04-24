ALTER TABLE `Prediction`
  MODIFY `market` ENUM('moneyline', 'totals', 'spread', 'both-teams-score', 'double-chance') NOT NULL,
  MODIFY `outcome` ENUM('home', 'away', 'draw', 'over', 'under', 'yes', 'no', 'home-draw', 'home-away', 'draw-away') NOT NULL;
