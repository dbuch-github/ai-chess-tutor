cask "ai-chess-tutor" do
  version "0.1.0"
  sha256 "eaf5712bf17d31432d185b667ba0fa7c86fcf2021696a0523167fefea7d31bfc"

  url "https://github.com/dbuch-github/ai-chess-tutor/releases/download/v#{version}/AI.Chess.Tutor-#{version}-arm64.dmg"
  name "AI Chess Tutor"
  desc "Desktop chess tutor combining a Chessnut Air board, UCI engines and an LLM coach"
  homepage "https://github.com/dbuch-github/ai-chess-tutor"

  depends_on arch: :arm64

  app "AI Chess Tutor.app"

  # The DMG is not code-signed/notarized (no Apple Developer Program membership,
  # see README). Without this, Gatekeeper reports the app as "damaged" on first
  # launch because of the quarantine flag Homebrew's download leaves in place.
  postflight do
    system_command "/usr/bin/xattr",
                    args: ["-cr", "#{appdir}/AI Chess Tutor.app"],
                    sudo: false
  end

  zap trash: [
    "~/Library/Application Support/AI Chess Tutor",
    "~/Library/Preferences/de.dbuch.aichesstutor.plist",
    "~/Library/Saved Application State/de.dbuch.aichesstutor.savedState"
  ]
end
