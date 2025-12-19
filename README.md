# Do-It App (Web Application)

## Overview
Do-It is a web-based task management application designed to help users organize, track, and manage their daily tasks efficiently.  
The system focuses on simplicity, security, and clean architectural design.

## Problem Statement
Many task management tools are either overly complex or lack proper security and structure.  
Do-It aims to provide a lightweight and secure solution with a clear separation of concerns.

## Features
- Secure user authentication
- Task creation, update, and deletion (CRUD)
- Persistent data storage
- Clean and responsive web interface
- Modular and scalable architecture

## System Architecture
The application follows a layered architecture:
- **Presentation Layer**: Web UI
- **Business Logic Layer**: Application logic and validation
- **Data Access Layer**: SQLite database operations

## Technologies Used
- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express.js
- **Database**: SQLite
- **Security**: bcrypt password hashing
- **Recovery System**: Rule-based Trusted Identity Pattern Matching System (TIPMS) for account recovery
- **Version Control**: Git & GitHub

## Security Design
- Passwords are never stored in plain text
- bcrypt is used for password hashing and verification
- Input validation to reduce common vulnerabilities
- Rule-based Trusted Identity Pattern Matching System (TIPMS) for account recovery

## UML Design
The system was designed using UML diagrams:
- Class Diagram
- Use Case Diagram
- Sequence Diagram
- Activity Diagram
- Entity Relationship Diagram
- Context Diagram Level 0
- State Diagram


## Challenges & Design Decisions
- Multi-user scope for simplicity and performance
- Local database for faster access and easier deployment
- Modular backend structure for maintainability

## Future Enhancements
- Multi-user support
- Cloud database integration
- Role-based access control
- Task and Daily reminders and notifications
- Rule-based Trusted Identity Pattern Matching System (TIPMS) for account recovery
- Export Data into PDF file

## Note
- We know it is not a full system and lack of many features but a journey of learning is hard and needs time.

## Authors
- Omar Adel
- Mohammed Abdelgawad Salem
- Omar Hamdy Fathy
- Hassan Salah El-Dien Hassan
- Eslam Hassen Mostafa
- Hossam El-Sayed Hassen
- Hassan Ramadan Mohammed
