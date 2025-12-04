CREATE DATABASE  IF NOT EXISTS `c372_supermarketdb` /*!40100 DEFAULT CHARACTER SET latin1 */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `c372_supermarketdb`;
-- MySQL dump 10.13  Distrib 8.0.44, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: c372_supermarketdb
-- ------------------------------------------------------
-- Server version	8.0.44

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `order_items`
--

DROP TABLE IF EXISTS `order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `order_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `orderId` int NOT NULL,
  `productId` int DEFAULT NULL,
  `name` varchar(200) NOT NULL,
  `price` decimal(10,2) NOT NULL DEFAULT '0.00',
  `quantity` int NOT NULL DEFAULT '0',
  `subtotal` decimal(10,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`id`),
  KEY `orderId` (`orderId`),
  CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`orderId`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=101 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `order_items`
--

LOCK TABLES `order_items` WRITE;
/*!40000 ALTER TABLE `order_items` DISABLE KEYS */;
INSERT INTO `order_items` VALUES (1,1,2,'Bananas',0.80,1,0.80),(2,1,3,'Milk',4.50,1,4.50),(3,1,25,'Honeycrisp Apples (1kg)',2.00,1,2.00),(4,1,26,'Artisan Sourdough Loaf',3.90,2,7.80),(5,5,25,'Honeycrisp Apples (1kg)',2.00,1,2.00),(6,5,26,'Artisan Sourdough Loaf',3.90,12,46.80),(7,6,2,'Bananas',0.80,3,2.40),(8,6,25,'Honeycrisp Apples (1kg)',2.00,1,2.00),(9,6,26,'Artisan Sourdough Loaf',3.90,1,3.90),(10,6,30,'Vine Tomatoes (500g)',3.10,1,3.10),(11,6,34,'Chicken Breast',5.90,2,11.80),(12,6,35,'Pasta Fusilli',1.80,2,3.60),(13,6,36,'Orange Juice',3.20,1,3.20),(14,6,37,'Baguette',2.00,1,2.00),(15,6,38,'Prawns per 100g',5.00,2,10.00),(16,7,2,'Bananas',0.80,4,3.20),(17,7,25,'Honeycrisp Apples (1kg)',2.00,1,2.00),(18,7,26,'Artisan Sourdough Loaf',3.90,1,3.90),(19,7,27,'Broccoli Florets (500g)',2.40,2,4.80),(20,7,30,'Vine Tomatoes (500g)',3.10,1,3.10),(21,7,32,'Fresh Milk 1L',4.50,3,13.50),(22,7,37,'Baguette',2.00,1,2.00),(23,7,38,'Prawns per 100g',5.00,1,5.00),(24,8,2,'Bananas',0.80,1,0.80),(25,9,2,'Bananas',0.80,1,0.80),(26,9,25,'Honeycrisp Apples (1kg)',2.00,1,2.00),(27,9,26,'Artisan Sourdough Loaf',3.90,1,3.90),(28,9,27,'Broccoli Florets (500g)',2.40,1,2.40),(29,9,30,'Vine Tomatoes (500g)',3.10,1,3.10),(30,10,25,'Honeycrisp Apples (1kg)',2.00,3,6.00),(31,11,2,'Bananas',0.80,1,0.80),(32,11,25,'Honeycrisp Apples (1kg)',2.00,3,6.00),(33,11,27,'Broccoli Florets (500g)',2.40,1,2.40),(34,11,32,'Fresh Milk 1L',4.50,1,4.50),(35,12,2,'Bananas',0.80,1,0.80),(36,12,38,'Prawns per 100g',5.00,1,5.00),(37,12,39,'Pokka Green Tea 500 ML ',1.50,1,1.50),(38,13,32,'Fresh Milk 1L',4.50,1,4.50),(39,13,36,'Orange Juice',3.20,1,3.20),(40,13,37,'Baguette',2.00,5,10.00),(41,13,38,'Prawns per 100g',5.00,5,25.00),(42,13,39,'Pokka Green Tea 500 ML ',1.50,5,7.50),(43,14,39,'Pokka Green Tea 500 ML ',1.50,1,1.50),(44,15,39,'Pokka Green Tea 500 ML ',1.50,1,1.50),(45,16,35,'Pasta Fusilli',1.80,1,1.80),(46,16,37,'Baguette',2.00,1,2.00),(47,16,38,'Prawns per 100g',5.00,1,5.00),(48,16,39,'Pokka Green Tea 500 ML ',1.50,1,1.50),(49,17,38,'Prawns per 100g',5.00,1,5.00),(50,17,39,'Pokka Green Tea 500 ML ',1.50,1,1.50),(51,18,30,'Vine Tomatoes (500g)',3.10,3,9.30),(52,18,34,'Chicken Breast',5.90,1,5.90),(53,18,37,'Baguette',2.00,1,2.00),(54,18,38,'Prawns per 100g',5.00,3,15.00),(55,19,34,'Chicken Breast',5.90,3,17.70),(56,20,36,'Orange Juice',3.20,14,44.80),(57,20,38,'Prawns per 100g',5.00,1,5.00),(58,21,35,'Pasta Fusilli',1.80,1,1.80),(59,21,38,'Prawns per 100g',5.00,1,5.00),(60,21,39,'Pokka Green Tea 500 ML ',1.50,1,1.50),(61,22,35,'Pasta Fusilli',1.80,1,1.80),(62,22,38,'Prawns per 100g',5.00,1,5.00),(63,22,39,'Pokka Green Tea 500 ML ',1.50,1,1.50),(64,23,35,'Pasta Fusilli',1.80,1,1.80),(65,23,39,'Pokka Green Tea 500 ML ',1.50,1,1.50),(66,24,32,'Fresh Milk 1L',4.50,5,22.50),(67,25,39,'Pokka Green Tea 500 ML ',1.50,1,1.50),(68,26,39,'Pokka Green Tea 500 ML ',1.50,1,1.50),(69,27,39,'Pokka Green Tea 500 ML ',1.50,1,1.50),(70,28,35,'Pasta Fusilli',1.80,3,5.40),(71,28,39,'Pokka Green Tea 500 ML ',1.50,2,3.00),(72,29,35,'Pasta Fusilli',1.80,3,5.40),(73,29,39,'Pokka Green Tea 500 ML ',1.50,1,1.50),(74,30,32,'Fresh Milk 1L',4.50,2,9.00),(75,30,39,'Pokka Green Tea 500 ML ',1.50,10,15.00),(76,31,35,'Pasta Fusilli',1.80,3,5.40),(77,31,38,'Prawns per 100g',5.00,1,5.00),(78,31,39,'Pokka Green Tea 500 ML ',1.50,1,1.50),(79,32,38,'Prawns per 100g',5.00,2,10.00),(80,33,38,'Prawns per 100g',5.00,3,15.00),(81,34,35,'Pasta Fusilli',1.80,11,19.80),(82,35,35,'Pasta Fusilli',1.80,1,1.80),(83,35,38,'Prawns per 100g',5.00,1,5.00),(84,36,35,'Pasta Fusilli',1.80,1,1.80),(85,36,38,'Prawns per 100g',5.00,1,5.00),(86,37,2,'Bananas',0.80,6,4.80),(87,38,35,'Pasta Fusilli',1.80,1,1.80),(88,38,38,'Prawns per 100g',5.00,1,5.00),(89,39,35,'Pasta Fusilli',1.80,1,1.80),(90,39,38,'Prawns per 100g',5.00,1,5.00),(91,39,39,'Pokka Green Tea 500 ML ',1.50,1,1.50),(92,40,25,'Honeycrisp Apples (1kg)',2.00,1,2.00),(93,40,27,'Broccoli Florets (500g)',2.40,1,2.40),(94,40,30,'Vine Tomatoes (500g)',3.10,1,3.10),(95,40,34,'Chicken Breast',5.90,1,5.90),(96,40,35,'Pasta Fusilli',1.80,1,1.80),(97,40,38,'Prawns per 100g',5.00,2,10.00),(98,40,39,'Pokka Green Tea 500 ML ',1.50,2,3.00),(99,41,39,'Pokka Green Tea 500 ML ',1.50,15,22.50),(100,42,2,'Bananas',0.80,1,0.80);
/*!40000 ALTER TABLE `order_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `orderNumber` varchar(64) NOT NULL,
  `userId` int DEFAULT NULL,
  `subtotal` decimal(10,2) NOT NULL DEFAULT '0.00',
  `deliveryFee` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total` decimal(10,2) NOT NULL DEFAULT '0.00',
  `deliveryMethod` varchar(32) NOT NULL DEFAULT 'standard',
  `paymentMethod` varchar(32) NOT NULL DEFAULT 'paynow',
  `paid` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  PRIMARY KEY (`id`),
  UNIQUE KEY `orderNumber` (`orderNumber`)
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

LOCK TABLES `orders` WRITE;
/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
INSERT INTO `orders` VALUES (1,'ORD-1763550143161-587',47,15.10,3.50,18.60,'standard','paynow',1,'2025-11-19 19:02:23','pending'),(2,'TESTORDER001',NULL,0.00,0.00,20.00,'standard','paynow',1,'2025-11-19 20:23:11','pending'),(3,'TESTORDER002',NULL,0.00,0.00,35.50,'standard','cash',1,'2025-11-19 20:23:11','pending'),(4,'TESTORDER003',NULL,0.00,0.00,12.00,'standard','paynow',1,'2025-11-19 20:23:11','completed'),(5,'ORD-1763559206148-811',47,48.80,3.50,52.30,'standard','card',1,'2025-11-19 21:33:26','pending'),(6,'ORD-1763559681369-319',47,42.00,3.50,45.50,'standard','paynow',1,'2025-11-19 21:41:21','pending'),(7,'ORD-1763560052047-471',47,37.50,3.50,41.00,'standard','paynow',1,'2025-11-19 21:47:32','pending'),(8,'ORD-1763560510797-687',47,0.80,3.50,4.30,'standard','paynow',1,'2025-11-19 21:55:10','pending'),(9,'ORD-1763561044892-227',47,12.20,3.50,15.70,'standard','paynow',1,'2025-11-19 22:04:04','pending'),(10,'ORD-1763607268524-525',47,6.00,3.50,9.50,'standard','paynow',1,'2025-11-20 10:54:28','completed'),(11,'ORD-1763612868437-864',47,13.70,3.50,17.20,'standard','paynow',1,'2025-11-20 12:27:48','pending'),(12,'ORD-1763632758852-380',52,7.30,3.50,10.80,'standard','card',1,'2025-11-20 17:59:18','pending'),(13,'ORD-1763642617041-295',52,50.20,3.50,53.70,'standard','paynow',1,'2025-11-20 20:43:37','pending'),(14,'ORD-1763642881141-918',52,1.50,0.00,1.50,'pickup','paynow',1,'2025-11-20 20:48:01','pending'),(15,'ORD-1763642966134-116',52,1.50,0.00,1.50,'pickup','paynow',1,'2025-11-20 20:49:26','processing'),(16,'ORD-1763643177165-398',52,10.30,6.00,16.30,'express','paynow',1,'2025-11-20 20:52:57','pending'),(17,'ORD-1763643219508-286',52,6.50,0.00,6.50,'pickup','paynow',1,'2025-11-20 20:53:39','completed'),(18,'ORD-1763731170096-895',52,32.20,3.50,35.70,'standard','applepay',1,'2025-11-21 21:19:30','processing'),(19,'ORD-1763889270907-850',47,17.70,3.50,21.20,'standard','paynow',1,'2025-11-23 17:14:30','completed'),(20,'ORD-1763992589103-691',47,49.80,0.00,49.80,'pickup','paynow',1,'2025-11-24 21:56:29','pending'),(21,'ORD-1763994970008-284',47,8.30,3.50,11.80,'standard','paynow',1,'2025-11-24 22:36:10','pending'),(22,'ORD-1763995160201-902',47,8.30,0.00,8.30,'pickup','paynow',1,'2025-11-24 22:39:20','processing'),(23,'ORD-1763995807531-798',47,3.30,0.00,3.30,'pickup','paynow',1,'2025-11-24 22:50:07','completed'),(24,'ORD-1763997160517-465',52,22.50,0.00,22.50,'pickup','paynow',1,'2025-11-24 23:12:40','pending'),(25,'ORD-1763997358322-557',52,1.50,0.00,1.50,'pickup','paynow',1,'2025-11-24 23:15:58','pending'),(26,'ORD-1763997426557-386',52,1.50,0.00,1.50,'pickup','paynow',1,'2025-11-24 23:17:06','pending'),(27,'ORD-1763997658631-344',52,1.50,0.00,1.50,'pickup','paynow',1,'2025-11-24 23:20:58','pending'),(28,'ORD-1764127120704-474',52,8.40,0.00,8.40,'pickup','paynow',1,'2025-11-26 11:18:40','pending'),(29,'ORD-1764129121991-525',52,6.90,0.00,6.90,'pickup','paynow',1,'2025-11-26 11:52:01','pending'),(30,'ORD-1764129232193-452',52,24.00,0.00,24.00,'pickup','paynow',1,'2025-11-26 11:53:52','completed'),(31,'ORD-1764129613495-961',52,11.90,0.00,11.90,'pickup','paynow',1,'2025-11-26 12:00:13','pending'),(32,'ORD-1764130068283-421',52,10.00,0.00,10.00,'pickup','paynow',1,'2025-11-26 12:07:48','pending'),(33,'ORD-1764130113602-563',52,15.00,0.00,15.00,'pickup','paynow',1,'2025-11-26 12:08:33','pending'),(34,'ORD-1764130153230-142',47,19.80,0.00,19.80,'pickup','paynow',1,'2025-11-26 12:09:13','pending'),(35,'ORD-1764223058307-411',52,6.80,0.00,6.80,'pickup','paynow',1,'2025-11-27 13:57:38','pending'),(36,'ORD-1764223427035-652',52,6.80,0.00,6.80,'pickup','paynow',1,'2025-11-27 14:03:47','pending'),(37,'ORD-1764236974503-290',47,4.80,0.00,4.80,'pickup','paynow',1,'2025-11-27 17:49:34','pending'),(38,'ORD-1764236998524-703',47,6.80,0.00,6.80,'pickup','paynow',1,'2025-11-27 17:49:58','pending'),(39,'ORD-1764237388253-149',47,8.30,0.00,8.30,'pickup','paynow',1,'2025-11-27 17:56:28','pending'),(40,'ORD-1764249314426-331',53,28.20,0.00,28.20,'pickup','applepay',1,'2025-11-27 21:15:14','pending'),(41,'ORD-1764582211681-106',47,22.50,0.00,22.50,'pickup','paynow',1,'2025-12-01 17:43:31','pending'),(42,'ORD-1764736783371-183',47,0.80,0.00,0.80,'pickup','paynow',1,'2025-12-03 12:39:43','pending');
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `productName` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `quantity` int NOT NULL DEFAULT '0',
  `price` double(10,2) NOT NULL,
  `image` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `category` varchar(50) COLLATE utf8mb4_general_ci DEFAULT 'General',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT INTO `products` VALUES (2,'Bananas',68,0.80,'bananas.png','Fruits'),(25,'Honeycrisp Apples (1kg)',99,2.00,'apples.png','Produce'),(26,'Artisan Sourdough Loaf',40,3.90,'bread.png','Bakery'),(27,'Broccoli Florets (500g)',84,2.40,'broccoli.png','Produce'),(30,'Vine Tomatoes (500g)',89,3.10,'tomatoes.png','Produce'),(32,'Fresh Milk 1L',100,4.50,'milk.png','Dairy'),(34,'Chicken Breast',99,5.90,'chicken.png','Meat'),(35,'Pasta Fusilli',104,1.80,'pasta.png','Pantry'),(38,'Prawns per 100g',19,5.00,'uploads/prawn-1763731220992.png','Seafood'),(39,'Pokka Green Tea 500 ML ',92,1.50,'uploads/green-tea-1763731229864.webp','Beverages');
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_carts`
--

DROP TABLE IF EXISTS `user_carts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_carts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `productId` int NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_product_unique` (`userId`,`productId`)
) ENGINE=InnoDB AUTO_INCREMENT=249 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_carts`
--

LOCK TABLES `user_carts` WRITE;
/*!40000 ALTER TABLE `user_carts` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_carts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(20) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `address` varchar(255) NOT NULL,
  `contact` varchar(10) NOT NULL,
  `role` varchar(10) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=54 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Peter Lim','peter@peter.com','7c4a8d09ca3762af61e59520943dc26494f8941b','Woodlands Ave 2','98765432','admin'),(2,'Mary Tan','mary@mary.com','7c4a8d09ca3762af61e59520943dc26494f8941b','Tampines Ave 1','12345678','user'),(3,'bobochan','bobochan@gmail.com','7c4a8d09ca3762af61e59520943dc26494f8941b','Woodlands','98765432','user'),(4,'sarahlee','sarahlee@gmail.com','7c4a8d09ca3762af61e59520943dc26494f8941b','Woodlands','98765432','user'),(5,'raphaelala','raphaelalee24@gmail.com','7c4a8d09ca3762af61e59520943dc26494f8941b','#14-230','89081215','user'),(6,'peter lim','peter@peter.com','20eabe5d64b0e216796e834f52d61fd0b70332fc','#14-230','89081215','admin'),(7,'hiangelo','angelomiguelcasia@gmail.com','7c4a8d09ca3762af61e59520943dc26494f8941b','#14-230','89081215','admin'),(8,'peter lim','peter@peter.com','7c222fb2927d828af22f592134e8932480637c0d','#14-230','89081215','admin'),(9,'peter lim','raphaelalee24@gmail.com','20eabe5d64b0e216796e834f52d61fd0b70332fc','#14-230','89081215','admin'),(10,'angelo ','angelo@angelo.com','20eabe5d64b0e216796e834f52d61fd0b70332fc','#14-230','12345678','admin'),(11,'raph','raphaelalee24@gmail.com','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','#14-230','89081215','user'),(12,'peter lim','raphaelalee24@gmail.com','8bb0cf6eb9b17d0f7d22b456f121257dc1254e1f01665370476383ea776df414','#14-230','89081215','user'),(13,'peter lim','peter@peter.com','4a9ca4596692e94f9d2912b06a0d007564a22ee750339a6021c2392149b25d6d','#14-230','89081215','user'),(14,'peter lim','peter@peter.com','8bb0cf6eb9b17d0f7d22b456f121257dc1254e1f01665370476383ea776df414','#14-230','12345678','user'),(15,'peter lim','peter@peter.com','8bb0cf6eb9b17d0f7d22b456f121257dc1254e1f01665370476383ea776df414','#14-230','12345678','user'),(16,'peter lim','raphaelalee24@gmail.com','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','#14-230','89081215','admin'),(17,'peter lim','raphaelalee24@gmail.com','ef797c8118f02dfb649607dd5d3f8c7623048c9c063d532cc95c5ed7a898a64f','#14-230','89081215','admin'),(18,'peter lim','peter@peter.com','8bb0cf6eb9b17d0f7d22b456f121257dc1254e1f01665370476383ea776df414','#14-230','89081215','admin'),(19,'angelo','angelo@angelo.com','8bb0cf6eb9b17d0f7d22b456f121257dc1254e1f01665370476383ea776df414','#14-230','89081215','user'),(20,'peter lim','raphaelalee24@gmail.com','8bb0cf6eb9b17d0f7d22b456f121257dc1254e1f01665370476383ea776df414','#14-230','89081215','user'),(21,'peter lim','raphaelalee24@gmail.com','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','#14-230','89081215','admin'),(22,'peter lim','peter@peter.com','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','#14-230','89081215','admin'),(23,'peter lim','peter@peter.com','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','#14-230','89081215','admin'),(24,'angelo','angelo@angelo.com','ef797c8118f02dfb649607dd5d3f8c7623048c9c063d532cc95c5ed7a898a64f','#14-230','89081215','user'),(25,'peter lim','peter@peter.com','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','#14-230','89081215','user'),(26,'angelo','angelo@angelo.com','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','#14-230','89081215','user'),(27,'peter lim','peter@peter.com','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','#14-230','89081215','user'),(28,'angelo ','angelo@angelo.com','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','#14-230','89081215','user'),(29,'peter lim','peter@peter.com','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','#14-230','89081215','admin'),(30,'angelo','angelo@angelo.com','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','#14-230','89081215','user'),(31,'peter lim','peter@peter.com','8bb0cf6eb9b17d0f7d22b456f121257dc1254e1f01665370476383ea776df414','#14-230','89081215','admin'),(32,'peter lim','peter@peter.com','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','#14-230','89081215','user'),(33,'peter lim','peter@peter.com','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','#14-230','89081215','user'),(34,'angelo','raphaelalee24@gmail.com','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','#14-230','89081215','admin'),(35,'peter lim','peter@peter.com','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','#14-230','89081215','user'),(36,'peter lim','peter@peter.com','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','#14-230','89081215','user'),(37,'peter lim','peter@peter.com','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','#14-230','89081215','admin'),(38,'peter lim','peter@peter.com','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','#14-230','89081215','user'),(39,'peter lim','peter@peter.com','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','#14-230','89081215','user'),(40,'peter lim ','peter@gmail.com','$2b$10$aOTPgJkWP5RehwhcgDPnwO4oModDYhOC3KnizKFgyjQUDyNmEsJOK','#14-230','89081215','user'),(41,'peter lim','peter@peter.com','$2b$10$HMHsTSEXjkobOmL5Lskm/./abscum4pm.GNlMAE/zFweJdk6uCXfa','woodlands ave 2 ','89081215','user'),(42,'peter lim','raphaelalee24@gmail.com','$2b$10$M70PTxdJ9oSOfqXG3jwgeefVKIp7.g7x.ty6SeYEbhdwDnpBQMX4u','#14-230','89081215','user'),(43,'peter lim','raphaelalee24@gmail.com','$2b$10$DOOvhjbhjVUsINPsiFqAfe5kmLFTNbDhWLc//BtgQwNZdA0Giud4y','#14-230','89081215','user'),(44,'peter lim','peter@peter.com','$2b$10$N1Qbk9Z0OFTVTzCroMspN.JyW3GSY/c0R.4CC1IftlEssoplg9uW6','#14-230','89081215','user'),(45,'rt54t54','raphaelalee24@gmail.com','$2b$10$QLOQ0pLlVaRPOQ70gF62ie/Mv/7IpxKbUNSDtI6FRD7DfJ7CYY.W6','#14-230','89081215','user'),(46,'user','user@gmail.com','$2b$10$gcdjJw8JXj193i3rpOiaOuD81gs5iKUROjrb9FNgVtFw4unhY19MK','Blk 763','11112222','user'),(47,'angelothebest','angelothebest@gmail.com','$2b$10$AaOiyDVLX2CJPkUxyH8IcumnfdVEkMFEzfcuwer/j37svJxeLZafq','Blk 736','11112222','user'),(48,'raphaelalee','raphaelalee@gmail.com','$2b$10$mc/eSoHZ4gXdj8xAYNJSiufcE6Lz5acAVPOGkB8zVfdsxhrErwAEO','#14-230','89081215','user'),(49,'scruffy','scruffy@gmail.com','$2b$10$LcGSI6w4EB1EcNo/V8x7W.u3SO/ca00UZD0O/p8BRJbFrmfqWY9Fm','#14-230','89081215','admin'),(50,'raphthebest','raphthebest@gmail.com','$2b$10$hEQXWE2UVHIGVcuzJ8jTreH9nhL4iaCR8D3T7.KExvtwrRYljGHf6','#14-230','89081215','admin'),(51,'hello','hello@hello.com','$2b$10$b5lRweXOVvQUGfVTtsz1J..ycZnjNfe0HOh5sPZQEJseX2VJscF9O','#14-230','89081215','admin'),(52,'mary jane ','maryjane@gmail.com','$2b$10$zsaZ/yCehbkP/WfZdK.8K.IHm4IpcJHUFTyak5nAnh.vbSwIguiOG','123 woodlands #13-110, 111777','8123 4567','user'),(53,'rachel','rachel@gmail.com','$2b$10$K.SLT.4WHSwiqW4G/TrQ7./p71Skhg52Ho9qstiIcYSqbxl2lkny6','111 woodlands #11-110','89081215','user');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-12-03 21:42:58
