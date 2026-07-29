graph TB
subgraph "Client Browser"
subgraph "React Application"
UI[UI Components]

            subgraph "Components Layer"
                Auth[Auth Components<br/>Login/Signup]
                Canvas[Canvas Components<br/>Canvas/Rectangle/Controls<br/>5000x5000px bounded]
                Collab[Collaboration Components<br/>Cursor/Presence]
                Layout[Layout Components<br/>Navbar]
            end

            subgraph "State Management"
                AuthCtx[Auth Context<br/>User State]
                CanvasCtx[Canvas Context<br/>Shapes State]
            end

            subgraph "Custom Hooks"
                useAuth[useAuth<br/>Auth Operations]
                useCanvas[useCanvas<br/>Canvas Operations]
                useCursors[useCursors<br/>Cursor Tracking]
                usePresence[usePresence<br/>Presence Management]
            end

            subgraph "Services Layer"
                AuthSvc[Auth Service<br/>signup/login/Google/logout]
                CanvasSvc[Canvas Service<br/>CRUD + Locking operations]
                CursorSvc[Cursor Service<br/>Position updates]
                PresenceSvc[Presence Service<br/>Online status]
                FirebaseInit[Firebase Initialization<br/>Config & Init]
            end

            subgraph "Rendering Engine"
                Konva[Konva.js<br/>Canvas Rendering<br/>60 FPS]
            end

            subgraph "Utilities"
                Helpers[Helper Functions<br/>generateUserColor]
                Constants[Constants<br/>Canvas dimensions]
            end
        end
    end

    subgraph "Firebase Backend"
        subgraph "Firebase Authentication"
            FBAuth[Firebase Auth<br/>User Management<br/>Email/Password + Google]
        end

        subgraph "Cloud Firestore"
            FSShapes[(Canvas Document<br/>canvas/global-canvas-v1<br/>Shapes array + Locking<br/>Persistent Storage)]
        end

        subgraph "Realtime Database"
            RTDBSession[(Session Path<br/>/sessions/global-canvas-v1/userId<br/>Cursor + Presence combined<br/>High-frequency updates)]
        end

        subgraph "Firebase Hosting"
            Hosting[Static File Hosting<br/>Deployed React App]
        end
    end

    subgraph "Testing Infrastructure"
        subgraph "Test Suite"
            UnitTests[Unit Tests<br/>Vitest + Testing Library]
            IntegrationTests[Integration Tests<br/>Multi-user scenarios]
        end

        subgraph "Firebase Emulators"
            AuthEmu[Auth Emulator]
            FirestoreEmu[Firestore Emulator]
            RTDBEmu[RTDB Emulator]
        end
    end

    %% Component to Context connections
    Auth --> AuthCtx
    Canvas --> CanvasCtx
    Collab --> CanvasCtx
    Layout --> AuthCtx

    %% Context to Hooks connections
    AuthCtx --> useAuth
    CanvasCtx --> useCanvas
    CanvasCtx --> useCursors
    CanvasCtx --> usePresence

    %% Hooks to Services connections
    useAuth --> AuthSvc
    useCanvas --> CanvasSvc
    useCursors --> CursorSvc
    usePresence --> PresenceSvc

    %% Services to Firebase Init
    AuthSvc --> FirebaseInit
    CanvasSvc --> FirebaseInit
    CursorSvc --> FirebaseInit
    PresenceSvc --> FirebaseInit

    %% Firebase connections
    FirebaseInit --> FBAuth
    FirebaseInit --> FSShapes
    FirebaseInit --> RTDBSession

    %% Rendering
    Canvas --> Konva

    %% Utilities
    Helpers -.-> Collab
    Constants -.-> Canvas

    %% Real-time sync paths
    CanvasSvc -->|Create/Update/Delete<br/>Lock/Unlock<br/>under 100ms| FSShapes
    FSShapes -->|Real-time listener<br/>onSnapshot| CanvasSvc

    CursorSvc -->|Position updates<br/>under 50ms at 20-30 FPS| RTDBSession
    RTDBSession -->|Real-time listener<br/>on value change| CursorSvc

    PresenceSvc -->|Online status<br/>onDisconnect| RTDBSession
    RTDBSession -->|Real-time listener<br/>on value change| PresenceSvc

    %% Auth flow
    AuthSvc -->|signup/login| FBAuth
    FBAuth -->|User token<br/>Session state| AuthSvc

    %% Deployment
    UI -.->|Build & Deploy<br/>npm run build| Hosting

    %% Testing connections
    UnitTests -.->|Test| AuthSvc
    UnitTests -.->|Test| CanvasSvc
    UnitTests -.->|Test| Helpers

    IntegrationTests -.->|Test via| AuthEmu
    IntegrationTests -.->|Test via| FirestoreEmu
    IntegrationTests -.->|Test via| RTDBEmu

    %% User interactions
    User([Users<br/>Multiple Browsers]) -->|Interact| UI
    User -->|Access deployed app| Hosting

    %% Styling
    classDef client fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    classDef firebase fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef testing fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef rendering fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    classDef user fill:#fce4ec,stroke:#c2185b,stroke-width:3px

    class Auth,Canvas,Collab,Layout,AuthCtx,CanvasCtx,useAuth,useCanvas,useCursors,usePresence,AuthSvc,CanvasSvc,CursorSvc,PresenceSvc,FirebaseInit,Helpers,Constants client
    class FBAuth,FSShapes,RTDBSession,Hosting firebase
    class UnitTests,IntegrationTests,AuthEmu,FirestoreEmu,RTDBEmu testing
    class Konva rendering
    class User user
