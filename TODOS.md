# TODOs

- agent-comms needs a projects table for registering which projects are worked and their status.
  - this way we don't do blow up context searching for projects on the filesystem.
  - project development can be paused when status is completed.
  - some table fields: projectname, directory (relative path to project), status - > in_progress,done
  - limit ARCHITECT to only have N projects in_progress at a time. if >= N, ARCHITECT rests/skips this run.
  - project manager decides when a project is `done` status.

- redo the rest of the org md files so they are better (a few have been done with chatgpt).
