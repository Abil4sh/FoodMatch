# FoodMatch 🍜

> **You choose. Your friends choose. FoodMatch finds the match.**

FoodMatch is a full-stack restaurant discovery platform that helps you and your friends decide where to eat based on what **everyone actually wants**.

Instead of relying on AI recommendations, FoodMatch lets each person independently swipe on restaurants and dishes, then finds the overlap between everyone's choices.

**SWIPE → MATCH → EAT**

---

## 🚀 Live Demo

**[Try FoodMatch](https://foodmatch-gray.vercel.app)**

> The backend runs on Render's free tier, so the first request after inactivity may take a little longer.
> <img width="1439" height="809" alt="Screenshot 2026-09-15 at 9 25 22 PM" src="https://github.com/user-attachments/assets/b0a93d57-d851-4bf7-b4f5-8910f4c97881" />
<img width="928" height="793" alt="Screenshot 2026-09-15 at 9 26 21 PM" src="https://github.com/user-attachments/assets/a506212a-eb65-48cc-8886-d3ed692d891f" />


---

## 🎯 The Problem

Choosing a restaurant with a group can be surprisingly difficult.

One person wants ramen. Another wants pizza. Someone wants something vegetarian. Someone else says, "I'm fine with anything."

Most restaurant apps focus on **individual discovery**.

FoodMatch focuses on **group decision-making**.

Everyone gets to make their own choice independently, and FoodMatch finds the overlap.

---

## 💡 The Core Idea

FoodMatch doesn't try to predict what you will like.

It asks you.

Each person swipes through the same set of restaurants or dishes:

- ❤️ Like
- ❌ Pass

Once everyone has voted, FoodMatch calculates which options have the strongest agreement.

The result is not an AI prediction.

It is the group's actual preference.

> **FoodMatch doesn't decide what you should eat. You and your friends do.**

---

# 🔄 Product Flow

## 👤 Solo Mode

Solo mode lets a user discover restaurants without creating a group.

```text
Open FoodMatch
      ↓
Choose Location
      ↓
Choose Restaurants / Dishes
      ↓
Browse Swipe Deck
      ↓
Like / Pass
      ↓
Open Restaurant
      ↓
View Details
      ↓
Get Directions
Solo mode does not require a group or account.
👥 Group Mode
The core FoodMatch experience is collaborative.
Create FoodMatch
      ↓
Generate 6-Character Group Code
      ↓
Share Code With Friends
      ↓
Friends Join Anonymously
      ↓
Everyone Enters Lobby
      ↓
Group Starts
      ↓
Backend Resolves Shared Deck
      ↓
Everyone Receives The Same Cards
      ↓
Each Person Swipes Independently
      ↓
Votes Stored In Backend
      ↓
Backend Calculates Group Overlap
      ↓
Results Ranked
      ↓
Match Reveal
      ↓
Restaurant Details
      ↓
Directions
      ↓
🍜 Eat
Example
Abilash   ❤️ Ramen House
Rahul     ❤️ Ramen House
Ananya    ❤️ Ramen House
Rohan     ❌ Ramen House
FoodMatch can reveal:
3 / 4 PEOPLE MATCHED

Ramen House

91% GROUP MATCH
The group can see who matched with the restaurant and why it ranked highly.
🧩 How Group Sessions Work
FoodMatch uses real backend state instead of simulated friend voting.
1. Create
A user creates a FoodMatch group.
The backend generates a unique six-character group code.

FM7K2Q
2. Join
Friends enter the code and choose a display name.
No traditional account or password is required.

Each participant receives an opaque participant token that identifies them within that session.

3. Start
Once the group starts, the backend resolves the restaurant deck.
The deck is then frozen so every participant receives the same set of cards.

4. Vote
Each participant independently submits:
LIKE
or
PASS
Votes are sent to Django and stored in PostgreSQL.
5. Match
The backend calculates the group overlap.
The frontend does not decide the final ranking.

6. Reveal
The frontend receives the ranked results and presents the strongest matches.
🧮 Matching Algorithm
FoodMatch intentionally uses a simple, deterministic matching algorithm instead of AI.
For each restaurant or dish:

Match % = Likes / Participants Who Voted × 100
For example:
4 participants voted

3 people liked Ramen House

Match % = 3 / 4 × 100
         = 75%
Results are ranked using deterministic tie-breakers:
1. Match score
2. Number of likes
3. Number of voters
4. Rating
5. Distance
6. Original deck order
This makes every result:
Explainable
Reproducible
Based on real group preferences
Independent of an AI recommendation model
The Django backend is authoritative for votes and matching.
🏗 Technical Architecture
                         ┌─────────────────────┐
                         │       Vercel        │
                         │    React + Vite     │
                         └──────────┬──────────┘
                                    │
                              REST API
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │       Render        │
                         │     Django API      │
                         └──────────┬──────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
          ┌──────────────────┐             ┌──────────────────┐
          │ Neon PostgreSQL  │             │     Geoapify     │
          │                  │             │   Places API     │
          │ Groups           │             │                  │
          │ Participants     │             │ Restaurants      │
          │ Deck Cards       │             │ Location Data    │
          │ Votes            │             └──────────────────┘
          └──────────────────┘
🔁 Data Flow
Restaurant Discovery
User
 ↓
React Frontend
 ↓
Django API
 ↓
Geoapify Places API
 ↓
Restaurant Results
 ↓
Django Normalization
 ↓
React Restaurant Cards
The Geoapify API key remains on the backend and is never exposed to the browser.
Group Voting
Participant
     ↓
React Swipe Interface
     ↓
Django Vote Endpoint
     ↓
Vote Validation
     ↓
PostgreSQL
     ↓
Matching Engine
     ↓
Ranked Results
     ↓
React Match Reveal
The backend is the source of truth for group results.
Location Flow
User
 ↓
Location Selector
 ↓
Curated Area / Location Search
 ↓
Selected Coordinates
 ↓
Django Feed
 ↓
Geoapify Restaurant Search
 ↓
Restaurant Cards
FoodMatch also has a bundled local catalog that can be used when the external restaurant API is unavailable.
Directions Flow
Restaurant
     ↓
Coordinates / Address
     ↓
FoodMatch Directions Service
     ↓
Keyless Google Maps URL
     ↓
Google Maps
Directions do not require a Google Maps API key or Google Cloud billing.
🧠 Backend Design
The group system is backed by real Django models and database state rather than simulated frontend state.
The core entities are:

FoodMatchGroup
       │
       ├── Participants
       │
       └── Deck Cards
               │
               └── Votes
FoodMatchGroup
Represents a group decision session.
Participant
Represents an anonymous person inside a group.
Participants use an opaque token instead of a traditional login system.

DeckCard
Represents a restaurant or dish included in the group's shared voting deck.
Vote
Stores a participant's decision for a specific card.
Duplicate votes are prevented at the database level.

🔐 Anonymous Participation
FoodMatch intentionally does not require traditional user accounts for the group experience.
The flow is:

Enter Group Code
       ↓
Choose Display Name
       ↓
Receive Participant Token
       ↓
Vote
This keeps the core experience frictionless.
A permanent account system is not required for the core FoodMatch experience.

📍 Location System
FoodMatch includes location-aware restaurant discovery.
Users can:

Select a location
Search locations
Choose from curated Bengaluru areas
Discover restaurants around the selected location
The application stores the selected location locally so it can be reused during the session.
🍽️ Restaurants & Dishes
FoodMatch supports two discovery modes:
RESTAURANTS | DISHES
Restaurants
Users swipe on complete restaurant options.
Dishes
Users can browse individual dishes associated with the available restaurant catalog.
For curated restaurants, FoodMatch can display approximate menu and pricing information.

For live restaurants without curated menu information, the application does not fabricate menu data.

🌐 Restaurant Discovery
FoodMatch uses Geoapify for server-side restaurant discovery.
FoodMatch Backend
       ↓
Geoapify Places API
       ↓
Restaurant Results
       ↓
Normalization
       ↓
FoodMatch UI
When the external restaurant API is unavailable, FoodMatch can fall back to bundled local catalog data.
This provides both:

Live restaurant discovery
A reliable local fallback
🧭 Directions
FoodMatch does not use Google Maps Platform APIs.
Instead, it generates a keyless Google Maps directions URL.

FoodMatch
    ↓
Restaurant coordinates / address
    ↓
Google Maps Directions URL
    ↓
Google Maps
No Google Cloud project, Maps API key, or Google billing account is required for directions.
🔌 API Architecture
The frontend communicates with Django through a service layer rather than scattering API requests throughout the UI.
React Screens
      ↓
Frontend Service Layer
      ↓
Django REST API
      ↓
Database / External APIs
This separation keeps UI components focused on presentation and interaction while backend communication remains centralized.
🛠 Tech Stack
Frontend
React
Vite
React Router
CSS Modules
Framer Motion
@use-gesture/react
Backend
Python
Django
Django REST Framework
Gunicorn
Database
PostgreSQL
Neon
SQLite is used for local development.
External Services
Geoapify Places API for restaurant discovery
Google Maps directions URLs for navigation
Vercel for frontend deployment
Render for backend deployment
Neon for hosted PostgreSQL
📁 Project Structure
FoodMatch/
│
├── backend/
│   ├── api/
│   ├── config/
│   ├── manage.py
│   ├── requirements.txt
│   └── .env.example
│
├── src/
│   ├── components/
│   │   ├── cards/
│   │   ├── layout/
│   │   └── primitives/
│   │
│   ├── screens/
│   │   ├── Discover/
│   │   ├── CreateMatch/
│   │   ├── InviteFriends/
│   │   ├── Lobby/
│   │   ├── Swipe/
│   │   ├── MatchReveal/
│   │   ├── RestaurantDetail/
│   │   └── Profile/
│   │
│   ├── services/
│   ├── store/
│   ├── hooks/
│   ├── data/
│   └── styles/
│
├── tests/
├── package.json
└── README.md
🧪 Testing
FoodMatch includes automated testing across multiple layers.
Testing covers areas including:

Django API behavior
Database-backed group sessions
Group matching
Solo mode
Location flows
Restaurant discovery
Dish discovery
Directions
Swipe interactions
Network behavior
Accessibility
Production builds
The project also checks that Django migrations remain synchronized with the current models.
🚀 Running Locally
Clone the repository
git clone https://github.com/Abil4sh/FoodMatch.git
cd FoodMatch
Frontend
Install dependencies:
npm install
Start the Vite development server:
npm run dev
Backend
Open another terminal and move into the backend:
cd backend
Create a virtual environment:
python3 -m venv .venv
Activate it:
source .venv/bin/activate
Install dependencies:
pip install -r requirements.txt
Create a .env file using .env.example as the template.
Run migrations:

python manage.py migrate
Start Django:
python manage.py runserver
☁️ Deployment Architecture
FoodMatch is deployed using a multi-service architecture:
                    GitHub
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
          Vercel               Render
        Frontend              Backend
             │                   │
             │                   ▼
             │            Neon PostgreSQL
             │
             └────── REST API ────┘

                       │
                       ▼
                   Geoapify
Frontend
Vercel
Hosts the React/Vite application.

Backend
Render
Hosts the Django API using Gunicorn.

Database
Neon
Provides the production PostgreSQL database.

Restaurant Discovery
Geoapify
Provides live restaurant discovery through the Django backend.

⚙️ Environment Variables
Sensitive configuration is stored outside the repository.
The application uses variables such as:

VITE_API_BASE_URL

DATABASE_URL

DJANGO_SECRET_KEY

DJANGO_DEBUG

DJANGO_ALLOWED_HOSTS

DJANGO_CORS_ALLOWED_ORIGINS

GEOAPIFY_API_KEY
Real values are never committed to GitHub.
The repository contains .env.example as a safe configuration template.

🔒 Security
FoodMatch includes several production-oriented protections:
Server-side API secrets
Environment-based configuration
Django allowed-host validation
CORS configuration
Request throttling
Database-level duplicate vote protection
Opaque anonymous participant tokens
Secrets excluded from Git
The Geoapify API key is never exposed through a frontend VITE_* variable.
⚠️ Current Limitations
FoodMatch is a portfolio project and currently has some limitations:
Curated menu information covers the bundled restaurant catalog rather than every live restaurant.
Live restaurant discovery depends on Geoapify availability and API limits.
Render's free backend tier can sleep after inactivity, which can make the first request slower.
Group sessions currently expire after a defined period.
Group progress currently uses polling rather than WebSockets.
Participants are anonymous session identities rather than permanent user accounts.
The current restaurant discovery experience is optimized around Bengaluru.
🗺️ Future Improvements
Potential future improvements include:
WebSocket-based real-time group updates
More comprehensive restaurant and menu data
Persistent user profiles
Improved restaurant detail information
More advanced group preference controls
Better caching and observability
Broader geographic coverage
💭 Why FoodMatch Is Different
FoodMatch deliberately avoids turning restaurant discovery into another AI recommendation engine.
The interesting part isn't predicting what people might like.

It's finding what they already agree on.

REAL RESTAURANTS
       ↓
EVERYONE SWIPES
       ↓
ACTUAL PREFERENCES
       ↓
FOODMATCH ALGORITHM
       ↓
EXPLAINABLE MATCHES
       ↓
"WE ALL WANT THIS"
       ↓
EAT 🍜
The result is based on the group's actual decisions, not a black-box recommendation.
👤 Author
Abilash Anand
GitHub

