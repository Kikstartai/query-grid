# Design rules

- **One definition per grid.** An app declares each grid once, in one object, and every package reads what it needs from it.
- **Server and client.** A server grid reads its rows over HTTP; a client grid holds them in memory.
- **Shapes alone limit a server grid.** A field can be filtered or sorted only where a shape names it. Fields carry no operators.
- **A client grid is not limited.** Every field can be filtered and sorted, in any combination.
