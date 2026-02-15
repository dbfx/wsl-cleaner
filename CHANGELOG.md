# [1.4.0](https://github.com/dbfx/wsl-cleaner/compare/v1.3.0...v1.4.0) (2026-02-15)



# [1.3.0](https://github.com/dbfx/wsl-cleaner/compare/v1.2.0...v1.3.0) (2026-02-15)


### Features

* startup manager, config editor, web pages ([bd92800](https://github.com/dbfx/wsl-cleaner/commit/bd928003356a0ff3725de941522f06ebaba32889))



# [1.2.0](https://github.com/dbfx/wsl-cleaner/compare/v1.1.0...v1.2.0) (2026-02-15)


### Features

* better css, splash animations, etc ([0bad2d7](https://github.com/dbfx/wsl-cleaner/commit/0bad2d7800eeb1591db6f784dc9752ce0b3ad2ee))
* cli mode, preferences, clean only option, size estimation ([bc7013a](https://github.com/dbfx/wsl-cleaner/commit/bc7013a58595d4ecc703136bb85ef2c66332762c))
* disk usage scanning ([db3c6d1](https://github.com/dbfx/wsl-cleaner/commit/db3c6d10cd91a0209ac5b3afc0546d4dc8669266))
* language support, persistent settings ([73c4c77](https://github.com/dbfx/wsl-cleaner/commit/73c4c77ba3b7b6fa3599b49fb7127c2491b77342))
* sounds, confetti, tooltip previews, etc ([4f13094](https://github.com/dbfx/wsl-cleaner/commit/4f130941bce493f9a94e32634139c2cecd9a57e7))
* tray options, improved completion page, etc ([607eefb](https://github.com/dbfx/wsl-cleaner/commit/607eefbfc19b19e950fc11f78dfe69ff96da04ac))
* wsl health center ([84c3acd](https://github.com/dbfx/wsl-cleaner/commit/84c3acdbd089fc8ab3be07a5af8748970564fc58))
* wsl system health ([82bd8c8](https://github.com/dbfx/wsl-cleaner/commit/82bd8c87699ba7d727022af4f6e8b038263a6b93))



# [1.1.0](https://github.com/dbfx/wsl-cleaner/compare/v1.0.3...v1.1.0) (2026-02-15)


### Features

* stats tracking ([e1fb6b7](https://github.com/dbfx/wsl-cleaner/commit/e1fb6b78d43506b0d84a9df9b5e9434637e7b9fe))



## [1.0.2](https://github.com/dbfx/wsl-cleaner/compare/v1.0.1...v1.0.2) (2026-02-15)


### Features

* distro selection, code improvement, tests. ci ([f52cb15](https://github.com/dbfx/wsl-cleaner/commit/f52cb157474c4dad73ea6a69ab3da3468cf2d9ed))



# Changelog

All notable changes to this project will be documented in this file.

This project uses [Conventional Commits](https://www.conventionalcommits.org/) and this changelog is auto-generated with [conventional-changelog](https://github.com/conventional-changelog/conventional-changelog).

## [1.0.2] - 2026-02-15

### Added
- Unit test suite with Vitest (52 tests across 3 files)
- CI/CD pipeline with GitHub Actions (test on push/PR, build + release on tag)
- Auto-generated changelog workflow with conventional-changelog
- Extracted pure utility functions into testable modules (`lib/utils.js`, `renderer/utils.js`, `renderer/tasks.js`)

## [1.0.1] - 2026-02-15

### Added
- Simple mode: one-click Clean & Compact workflow
- Advanced mode: individual task toggles, stale directory scanner, manual compaction
- 47 cleanup tasks across 5 categories (System, User & Editor, Package Managers, Framework & Project, Aggressive)
- Tool auto-detection for 22+ tools (apt, dnf, npm, yarn, docker, etc.)
- Stale directory scanner with configurable age threshold
- VHDX disk compaction via Optimize-VHD with UAC elevation
- Filesystem TRIM support with zero-fill fallback
- Real-time streaming output for all operations
- Auto-updater via electron-updater with GitHub Releases
- Custom frameless window with dark mode UI
- Single-instance lock
- Dual distro support (Debian/Ubuntu with apt, Fedora/RHEL with dnf)

## [1.0.0] - 2026-02-14

### Added
- Initial release
