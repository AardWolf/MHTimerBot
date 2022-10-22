# Overview

This project started with a very straightforward goal of alerting people to in-game timers within the game of [MouseHunt](https://www.mousehuntgame.com). It was later enhanced to work with another community tool, [MouseHunt Community Tools (MHCT)](https://www.mhct.win). This added complexity led to... simplifying(?)... how the bot works and consequently it's become quite a bit easier to contribute to the project! Now we work with other sites and player-maintained resources to provide answers to the questions people ask on Discord. Whether you understand the game or not, you can contribute!

# Really New Contributors

We have a very active group of "community tools" developers on the main [MouseHunt Discord server](https://discord.gg/mousehunt). We hang out in the #community-tools channel, feel free to ask questions about how to work with Github, contribute to any of the repos we work on, or general stuff that may or may not be related to MouseHunt. Github itself has [a contributing guide](https://github.com/github/docs/blob/main/CONTRIBUTING.md) that will help you get going with some basics. 

Once you get set up you can check for any "[Good First Issue](https://github.com/AardWolf/MHTimerBot/issues?q=is%3Aissue+is%3Aopen+label%3Agood-first-issue)" issues that we've tagged. We really try to limit that tag to things that should only need minor changes or updates - things we would otherwise eventually get around to doing. We have a fair number of people express interest so we try to leave some of those open.

# Contributing to The Bot

There are a few areas that you can contribute to with different degrees of complexity. This bot is set up according to (at one point) the recommendation from the Discord.js community. The commands are in `src/commands` and they use shared libraries in `src/modules`. We have other bits and bobs around the code tree, including the `tests` section for automated code test coverage.

## Working With Commands

This bot's main code dynamically loads any command with a `.js` extension in `src/commands`. So it is easy to determine which file to start with based on the command name. It is also relatively easy to add a new command, just create a new file in that directory. Since commands are modular there are some aspects to keep in mind and you can usually reference existing commands for examples.

End you command with a `module.exports` object. At a minimum it needs a `name` (String) and an `execute` (async function that accepts the command and tokens. It returns a CommandResult object). Better than an `execute` is `slashCommand` and `interactionHandler`. These let the bot define a slash command and this is the way Discord is moving. At this time, `minluck.js` has both the traditional (`-mh minluck <mouse>`) and slash-command implementation and can serve as a reference.

Each command is responsible for managing the sending of its reply and the handling of any follow-on interactions. It is also responsible for loading and saving any data that needs to be loaded and saved, and managing that data. `src/modules/mhct-lookup.js` is an example of a library used by several commands (`find`, `ifind`, `whatsin`, `minluck`) that manages list of things that can be looked up, reaction menus, and other odds and ends. 

## Contributing Tests

We use `tape` and `sinon` to run our testing. Historically our test coverage is poor and this is an area we can always use help! We have a couple stubs and mocks already created to assist with testing and if more were added then we could increase coverage. There's a good chance we still need an interaction stub, for example.

Feel free to copy an existing test file and adding scenarios that are appropriate for the code. And tests that are not appropriate for the code!

## Contributing Documentation

People with different skill levels may have interest in hosting their own copy of this bot and the current documentation is not particularly detailed or graphical. Plus documenting interactions with other services is useful, especially when they change or get abandoned. Feel free to add additional markdowns or update existing ones.

# Issues

Whether you want to tackle an issue or make your voice/opinion heard in an issue feel free to add comments, updates, code samples, etc to issues!

# Pull Requests

We have a bot running off the main branch and tend to be slow to approve Pull Requests - but we try to be quick to respond to them either with reviews or comments. Before merging with main we'll run the bot on the proposed branch in a dev environment and poke at the changed functionality for a bit.
