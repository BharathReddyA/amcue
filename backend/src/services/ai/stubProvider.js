function generateStubContent(project) {
  return {
    caption: `Check out ${project.name} — ${project.description}!`,
    imageUrl: `https://picsum.photos/seed/${project.id}/600/400`,
  };
}

module.exports = { generateStubContent };
